import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '../../../core/config/config.service';
import {
  IStorageProvider,
  StorageError,
  StorageFileNotFoundError,
  StorageInvalidKeyError,
  StorageUploadInput,
  StorageUploadResult,
} from './storage.interface';

/**
 * Injection token for Backblaze B2 HTTP fetch client.
 * Allows injecting custom/mock fetch in tests while cleanly resolving in Nest DI.
 */
export const B2_HTTP_CLIENT = Symbol('B2_HTTP_CLIENT');
export type B2HttpClient = typeof fetch;

/**
 * Bucket entry inside apiInfo.storageApi.allowed in B2 Native API v4 response.
 */
export interface B2StorageApiAllowedBucket {
  id: string;
  name: string;
}

/**
 * Permissions and scope inside apiInfo.storageApi.allowed in B2 Native API v4 response.
 */
export interface B2StorageApiAllowed {
  buckets?: B2StorageApiAllowedBucket[];
  capabilities: string[];
  namePrefix?: string | null;
  bucketId?: string | null;
  bucketName?: string | null;
}

/**
 * Storage API endpoints and limits in B2 Native API v4 response.
 */
export interface B2StorageApiInfo {
  absoluteMinimumPartSize?: number;
  apiUrl: string;
  downloadUrl: string;
  recommendedPartSize?: number;
  s3ApiUrl?: string;
  allowed?: B2StorageApiAllowed;
}

/**
 * apiInfo object in B2 Native API v4 response.
 */
export interface B2ApiInfo {
  storageApi?: B2StorageApiInfo;
  [key: string]: unknown;
}

/**
 * B2 authorization response from b2_authorize_account (v4 native structure).
 */
export interface B2AuthResponse {
  accountId: string;
  authorizationToken: string;
  apiInfo?: B2ApiInfo;
  applicationKeyExpirationTimestamp?: number | null;
  // Clean fallback for legacy v3 top-level fields if present
  apiUrl?: string;
  downloadUrl?: string;
}

/**
 * Cached authorization state – stored in memory only, never persisted or logged.
 */
export interface B2AuthState {
  authorizationToken: string;
  accountId: string;
  apiUrl: string;
  downloadUrl: string;
  /** ms timestamp when the token was obtained; used for proactive refresh. */
  fetchedAt: number;
}

/**
 * Response from b2_get_upload_url.
 */
export interface B2UploadUrlResponse {
  uploadUrl: string;
  authorizationToken: string;
  bucketId: string;
}

/**
 * Response from b2_upload_file (fields we consume).
 */
export interface B2UploadFileResponse {
  fileId: string;
  fileName: string;
  contentLength: number;
}

/**
 * B2NativeStorageProvider
 *
 * Implements IStorageProvider using the Backblaze B2 Native API (NOT the S3-compatible API).
 * This avoids ALL S3-SDK checksum/chunked-encoding issues that caused the
 * "request body was too small" production error on the S3-compatible path.
 *
 * Why the S3-compatible path failed:
 *   AWS SDK v3 signs requests and can negotiate chunked transfer encoding
 *   or insert checksum trailers at the HTTP layer even with WHEN_REQUIRED set,
 *   because Node.js fetch internals and the SDK's request pipeline can disagree
 *   on whether to buffer. B2 rejects any request where the announced
 *   Content-Length doesn't exactly match the wire bytes received.
 *
 * Why the Native API avoids this:
 *   - No AWS SDK in the request path -> no automatic header or trailer injection.
 *   - Explicit Content-Length = buffer.byteLength on every upload request.
 *   - Explicit X-Bz-Content-Sha1 = sha1(buffer) for B2 integrity validation.
 *   - Body is a Node.js Buffer passed directly to fetch() -> no stream ambiguity.
 *
 * Upload flow (3 steps):
 *   1. b2_authorize_account  -> cached authorizationToken + apiUrl + downloadUrl
 *   2. b2_get_upload_url     -> per-upload uploadUrl + per-upload token
 *   3. b2_upload_file POST   -> file bytes + explicit headers
 *
 * Download flow:
 *   GET downloadUrl/file/{bucketName}/{fileKey} with Authorization header.
 *
 * Delete flow:
 *   1. b2_list_file_names with prefix=fileKey to resolve fileId
 *   2. b2_delete_file_version with fileName + fileId
 *
 * Security:
 *   - Credentials (B2_KEY_ID, B2_APPLICATION_KEY) are never logged.
 *   - Authorization token is cached in-memory only, replaced on refresh.
 *   - Bucket is always private; file URLs served through the authenticated API.
 */
@Injectable()
export class B2NativeStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(B2NativeStorageProvider.name);

  /** B2 Native API entry point – fixed by Backblaze, never changes. */
  static readonly B2_AUTH_URL =
    'https://api.backblazeb2.com/b2api/v3/b2_authorize_account';

  /**
   * Authorization token expiry window.
   * B2 tokens are valid for 24 hours; we refresh proactively after 23 hours
   * to avoid using an expired token at the boundary.
   */
  static readonly TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours

  readonly keyId: string;
  readonly applicationKey: string;
  readonly bucketId: string;
  readonly bucketName: string;

  /** In-memory auth cache – never exported, serialized, or logged. */
  authState: B2AuthState | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(B2_HTTP_CLIENT)
    private readonly customFetch?: typeof fetch
  ) {
    this.keyId = this.configService.b2KeyId ?? '';
    this.applicationKey = this.configService.b2ApplicationKey ?? '';
    this.bucketId = this.configService.b2BucketId ?? '';
    this.bucketName = this.configService.b2BucketName ?? '';

    if (
      (!this.configService.storageProvider ||
        this.configService.storageProvider === 'b2') &&
      (!this.keyId ||
        !this.applicationKey ||
        !this.bucketId ||
        !this.bucketName)
    ) {
      throw new Error(
        'B2NativeStorageProvider requires B2_KEY_ID, B2_APPLICATION_KEY, ' +
          'B2_BUCKET_ID, and B2_BUCKET_NAME to be set in the environment.'
      );
    }
  }

  private get fetchFn(): typeof fetch {
    return this.customFetch ?? globalThis.fetch;
  }

  // ---------------------------------------------------------------------------
  // IStorageProvider public interface
  // ---------------------------------------------------------------------------

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const fileKey = `${crypto.randomUUID()}.pdf`;
    this.verifyKey(fileKey);

    // Compute SHA-1 of the exact Buffer to be uploaded (required by B2)
    const sha1 = crypto.createHash('sha1').update(input.buffer).digest('hex');

    // Attempt upload; retry once on transient errors with a fresh upload URL.
    // B2 recommends this pattern because b2_get_upload_url endpoints can
    // temporarily become unavailable (408, 429, 500, 503).
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      let uploadUrlData: B2UploadUrlResponse;
      try {
        if (
          attempt > 1 &&
          lastError instanceof StorageError &&
          (lastError.message.includes('401') ||
            lastError.message.includes('expired'))
        ) {
          await this.authorize(true);
        }
        uploadUrlData = await this.getUploadUrl();
      } catch (err: unknown) {
        lastError = err;
        if (attempt < 2 && this.isRetryableUploadError(err)) {
          this.logger.warn(
            `B2 uploadUrl attempt ${attempt} failed (${this.sanitize(err)}), retrying...`
          );
          continue;
        }
        if (err instanceof StorageError) throw err;
        throw new StorageError(
          `Failed to obtain B2 upload URL: ${this.sanitize(err)}`,
          true,
          'STORAGE_UPLOAD_FAILED'
        );
      }

      try {
        const uploadedFile = await this.doUpload(
          uploadUrlData,
          fileKey,
          input,
          sha1
        );
        this.logger.log(
          `B2 upload succeeded: key=${uploadedFile.fileName} size=${uploadedFile.contentLength}`
        );
        const downloadBase =
          this.authState?.downloadUrl || 'https://f000.backblazeb2.com';
        const fileUrl = `${downloadBase}/file/${encodeURIComponent(this.bucketName)}/${encodeURIComponent(fileKey)}`;
        return { fileKey, fileUrl };
      } catch (err: unknown) {
        lastError = err;
        if (attempt < 2 && this.isRetryableUploadError(err)) {
          this.logger.warn(
            `B2 upload attempt ${attempt} failed (${this.sanitize(err)}), ` +
              'retrying with fresh upload URL...'
          );
          continue;
        }
        break;
      }
    }

    this.logger.error(`B2 upload failed: ${this.sanitize(lastError)}`);
    if (lastError instanceof StorageError) {
      throw lastError;
    }
    throw new StorageError(
      `Failed to upload resume file to B2: ${this.sanitize(lastError)}`,
      true,
      'STORAGE_UPLOAD_FAILED'
    );
  }

  async delete(fileKey: string): Promise<void> {
    this.verifyKey(fileKey);

    try {
      const auth = await this.authorize();
      const fileId = await this.resolveFileId(auth, fileKey);
      if (!fileId) {
        // File not found – treat as already deleted (matches best-effort S3 semantics)
        this.logger.warn(
          `B2 delete: file not found for key "${fileKey}", skipping`
        );
        return;
      }
      await this.doDelete(auth, fileKey, fileId);
    } catch (err: unknown) {
      // Best-effort: log but never throw to caller
      this.logger.warn(
        `Failed to delete B2 file (${fileKey}): ${this.sanitize(err)}`
      );
    }
  }

  async getBuffer(fileKey: string): Promise<Buffer> {
    this.verifyKey(fileKey);

    try {
      let auth = await this.authorize();
      let downloadUrl =
        `${auth.downloadUrl}/file/` +
        `${encodeURIComponent(this.bucketName)}/${encodeURIComponent(fileKey)}`;

      let response = await this.fetchFn(downloadUrl, {
        method: 'GET',
        headers: { Authorization: auth.authorizationToken },
      });

      if (response.status === 401) {
        // Token expired – refresh and retry once
        auth = await this.authorize(true);
        downloadUrl =
          `${auth.downloadUrl}/file/` +
          `${encodeURIComponent(this.bucketName)}/${encodeURIComponent(fileKey)}`;
        response = await this.fetchFn(downloadUrl, {
          method: 'GET',
          headers: { Authorization: auth.authorizationToken },
        });
      }

      if (response.status === 404) {
        throw new StorageFileNotFoundError(fileKey);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new StorageError(
          `B2 download failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`,
          response.status >= 500,
          'STORAGE_READ_FAILED'
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err: unknown) {
      if (err instanceof StorageFileNotFoundError) throw err;
      if (err instanceof StorageError) throw err;
      this.logger.error(
        `Failed to read B2 file (${fileKey}): ${this.sanitize(err)}`
      );
      throw new StorageError(
        `Failed to retrieve resume file from B2: ${this.sanitize(err)}`,
        true,
        'STORAGE_READ_FAILED'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // B2 API internal methods
  // ---------------------------------------------------------------------------

  /**
   * Authorize with Backblaze B2.
   * Caches the token for TOKEN_TTL_MS and proactively re-authorizes on expiry.
   * Never logs keyId, applicationKey, or authorizationToken.
   */
  async authorize(forceRefresh = false): Promise<B2AuthState> {
    const now = Date.now();

    if (
      !forceRefresh &&
      this.authState !== null &&
      now - this.authState.fetchedAt < B2NativeStorageProvider.TOKEN_TTL_MS
    ) {
      return this.authState;
    }

    const credentials = Buffer.from(
      `${this.keyId}:${this.applicationKey}`
    ).toString('base64');

    const response = await this.fetchFn(B2NativeStorageProvider.B2_AUTH_URL, {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new StorageError(
        `B2 authorization failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`,
        response.status >= 500,
        'STORAGE_AUTH_FAILED'
      );
    }

    let data: B2AuthResponse;
    try {
      data = (await response.json()) as B2AuthResponse;
    } catch {
      throw new StorageError(
        'B2 authorization response is not valid JSON',
        false,
        'STORAGE_AUTH_FAILED'
      );
    }

    const authorizationToken = data.authorizationToken;
    const accountId = data.accountId;
    const storageApi = data.apiInfo?.storageApi;
    const apiUrl = storageApi?.apiUrl || data.apiUrl;
    const downloadUrl = storageApi?.downloadUrl || data.downloadUrl;

    if (!authorizationToken || !accountId || !apiUrl || !downloadUrl) {
      const missingFields: string[] = [];
      if (!authorizationToken) missingFields.push('authorizationToken');
      if (!accountId) missingFields.push('accountId');
      if (!apiUrl) missingFields.push('apiInfo.storageApi.apiUrl');
      if (!downloadUrl) missingFields.push('apiInfo.storageApi.downloadUrl');

      throw new StorageError(
        `B2 authorization response missing required fields: ${missingFields.join(', ')}`,
        false,
        'STORAGE_AUTH_FAILED'
      );
    }

    const authState: B2AuthState = {
      authorizationToken,
      accountId,
      apiUrl,
      downloadUrl,
      fetchedAt: now,
    };
    this.authState = authState;

    return authState;
  }

  /**
   * Calls b2_get_upload_url to get a per-upload target URL and token.
   * Automatically refreshes the account authorization token on 401.
   */
  async getUploadUrl(): Promise<B2UploadUrlResponse> {
    const auth = await this.authorize();
    const url = `${auth.apiUrl}/b2api/v3/b2_get_upload_url`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucketId: this.bucketId }),
    });

    if (response.status === 401) {
      // Account token expired – refresh and retry once
      const freshAuth = await this.authorize(true);
      const retryResponse = await this.fetchFn(
        `${freshAuth.apiUrl}/b2api/v3/b2_get_upload_url`,
        {
          method: 'POST',
          headers: {
            Authorization: freshAuth.authorizationToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bucketId: this.bucketId }),
        }
      );
      if (!retryResponse.ok) {
        const body = await retryResponse.text().catch(() => '');
        throw new StorageError(
          `b2_get_upload_url failed after token refresh (HTTP ${retryResponse.status}): ${this.sanitizeBody(body)}`,
          true,
          'STORAGE_UPLOAD_FAILED'
        );
      }
      let retryData: B2UploadUrlResponse;
      try {
        retryData = (await retryResponse.json()) as B2UploadUrlResponse;
      } catch {
        throw new StorageError(
          'b2_get_upload_url returned invalid JSON response',
          false,
          'STORAGE_UPLOAD_FAILED'
        );
      }
      if (!retryData.uploadUrl || !retryData.authorizationToken) {
        throw new StorageError(
          'b2_get_upload_url returned malformed response',
          false,
          'STORAGE_UPLOAD_FAILED'
        );
      }
      return retryData;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new StorageError(
        `b2_get_upload_url failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`,
        response.status >= 500,
        'STORAGE_UPLOAD_FAILED'
      );
    }

    let data: B2UploadUrlResponse;
    try {
      data = (await response.json()) as B2UploadUrlResponse;
    } catch {
      throw new StorageError(
        'b2_get_upload_url returned invalid JSON response',
        false,
        'STORAGE_UPLOAD_FAILED'
      );
    }
    if (!data.uploadUrl || !data.authorizationToken) {
      throw new StorageError(
        'b2_get_upload_url returned malformed response',
        false,
        'STORAGE_UPLOAD_FAILED'
      );
    }
    return data;
  }

  /**
   * Executes the actual b2_upload_file POST request.
   *
   * Critical properties that make this reliable vs. the S3-compatible path:
   *   1. No AWS SDK -> no automatic x-amz-checksum-* trailer injection.
   *   2. Explicit Content-Length = buffer.byteLength -> no chunked encoding.
   *   3. Explicit X-Bz-Content-Sha1 = sha1(buffer) -> B2 validates integrity.
   *   4. Body is a Node.js Buffer -> no stream ambiguity or re-encoding.
   */
  async doUpload(
    uploadUrlData: B2UploadUrlResponse,
    fileKey: string,
    input: StorageUploadInput,
    sha1: string
  ): Promise<B2UploadFileResponse> {
    const headers: Record<string, string> = {
      Authorization: uploadUrlData.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileKey),
      'Content-Type': input.mimeType || 'application/pdf',
      'Content-Length': String(input.buffer.byteLength),
      'X-Bz-Content-Sha1': sha1,
    };
    if (input.studentId) {
      headers['X-Bz-Info-studentid'] = encodeURIComponent(input.studentId);
    }

    const response = await this.fetchFn(uploadUrlData.uploadUrl, {
      method: 'POST',
      headers,
      body: input.buffer,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const isRetryable =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status === 401; // 401 upload token expired
      throw new StorageError(
        `b2_upload_file failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`,
        isRetryable,
        'STORAGE_UPLOAD_FAILED'
      );
    }

    let data: B2UploadFileResponse;
    try {
      data = (await response.json()) as B2UploadFileResponse;
    } catch {
      throw new StorageError(
        'b2_upload_file returned invalid JSON response',
        false,
        'STORAGE_UPLOAD_FAILED'
      );
    }
    if (!data.fileName) {
      throw new StorageError(
        'b2_upload_file returned malformed response',
        false,
        'STORAGE_UPLOAD_FAILED'
      );
    }
    return data;
  }

  /**
   * Generates a pre-authorized native download URL for a file.
   */
  async getPresignedUrl(
    fileKey: string,
    expiresInSeconds = 900
  ): Promise<string> {
    this.verifyKey(fileKey);
    const auth = await this.authorize();
    const url = `${auth.apiUrl}/b2api/v3/b2_get_download_authorization`;
    const duration = Math.min(Math.max(expiresInSeconds, 1), 604800);
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId: this.bucketId,
        fileNamePrefix: fileKey,
        validDurationInSeconds: duration,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new StorageError(
        `b2_get_download_authorization failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`,
        response.status >= 500,
        'STORAGE_READ_FAILED'
      );
    }
    const data = (await response.json()) as { authorizationToken: string };
    return `${auth.downloadUrl}/file/${encodeURIComponent(this.bucketName)}/${encodeURIComponent(fileKey)}?Authorization=${encodeURIComponent(data.authorizationToken)}`;
  }

  /**
   * Lists a single file version by exact name to resolve the fileId needed
   * for b2_delete_file_version. Uses b2_list_file_names with a tight prefix.
   */
  private async resolveFileId(
    auth: B2AuthState,
    fileKey: string
  ): Promise<string | null> {
    const url = `${auth.apiUrl}/b2api/v3/b2_list_file_names`;

    let response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId: this.bucketId,
        prefix: fileKey,
        maxFileCount: 1,
      }),
    });

    if (response.status === 401) {
      const freshAuth = await this.authorize(true);
      response = await this.fetchFn(
        `${freshAuth.apiUrl}/b2api/v3/b2_list_file_names`,
        {
          method: 'POST',
          headers: {
            Authorization: freshAuth.authorizationToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bucketId: this.bucketId,
            prefix: fileKey,
            maxFileCount: 1,
          }),
        }
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new StorageError(
        `b2_list_file_names failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`,
        true,
        'STORAGE_DELETE_FAILED'
      );
    }

    try {
      const data = (await response.json()) as {
        files?: Array<{ fileId: string; fileName: string }>;
      };
      const match = data.files?.find((f) => f.fileName === fileKey);
      return match?.fileId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Deletes a specific file version via b2_delete_file_version.
   * Failure is logged as a warning (delete is best-effort).
   */
  private async doDelete(
    auth: B2AuthState,
    fileKey: string,
    fileId: string
  ): Promise<void> {
    const url = `${auth.apiUrl}/b2api/v3/b2_delete_file_version`;

    let response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: fileKey, fileId }),
    });

    if (response.status === 401) {
      const freshAuth = await this.authorize(true);
      response = await this.fetchFn(
        `${freshAuth.apiUrl}/b2api/v3/b2_delete_file_version`,
        {
          method: 'POST',
          headers: {
            Authorization: freshAuth.authorizationToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileName: fileKey, fileId }),
        }
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(
        `b2_delete_file_version failed (HTTP ${response.status}): ${this.sanitizeBody(body)}`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private verifyKey(fileKey: string): void {
    if (!/^[a-zA-Z0-9-]+\.pdf$/.test(fileKey)) {
      throw new StorageInvalidKeyError(
        fileKey,
        'Invalid storage file key format'
      );
    }
  }

  /**
   * Returns true for errors where retrying with a fresh upload URL is appropriate.
   * Per B2 docs: 408, 429, 500, 503 on the upload URL endpoint mean retry with fresh URL.
   * 401 on doUpload also means upload token is expired.
   */
  private isRetryableUploadError(err: unknown): boolean {
    if (err instanceof StorageError) {
      return err.isRetryable;
    }
    if (
      err instanceof TypeError ||
      (err instanceof Error && err.name === 'FetchError')
    ) {
      return true;
    }
    return false;
  }

  /**
   * Sanitizes error messages to prevent credentials from appearing in logs.
   */
  sanitize(err: unknown): string {
    if (err instanceof Error) {
      return this.sanitizeBody(err.message);
    }
    return this.sanitizeBody(String(err));
  }

  sanitizeBody(body: string): string {
    let s = body;
    if (this.keyId && this.keyId.length >= 4) {
      s = s.split(this.keyId).join('[REDACTED]');
    }
    if (this.applicationKey && this.applicationKey.length >= 4) {
      s = s.split(this.applicationKey).join('[REDACTED]');
    }
    const rawCreds = `${this.keyId}:${this.applicationKey}`;
    const base64Creds = Buffer.from(rawCreds).toString('base64');
    if (base64Creds && base64Creds.length >= 4) {
      s = s.split(base64Creds).join('[REDACTED]');
    }
    if (this.authState?.authorizationToken) {
      const token = this.authState.authorizationToken;
      if (token.length >= 4) {
        s = s.split(token).join('[REDACTED_TOKEN]');
      }
    }
    s = s.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
    s = s.replace(
      /authorizationToken['":\s]+['"]([^'"]+)['"]/gi,
      'authorizationToken": "[REDACTED_TOKEN]"'
    );
    return s;
  }
}
