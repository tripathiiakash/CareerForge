import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

@Injectable()
export class S3StorageProvider implements IStorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint?: string;
  private readonly region: string;

  constructor(
    private readonly configService: ConfigService,
    @Optional() injectedClient?: S3Client
  ) {
    this.bucket = this.configService.s3Bucket || '';
    this.endpoint = this.configService.s3Endpoint;
    this.region = this.configService.s3Region || 'auto';

    if (injectedClient) {
      this.s3Client = injectedClient;
    } else {
      const clientConfig: S3ClientConfig = {
        region: this.region,
        credentials: {
          accessKeyId: this.configService.s3AccessKeyId || '',
          secretAccessKey: this.configService.s3SecretAccessKey || '',
        },
        /**
         * B2 / S3-compatible provider compatibility (AWS SDK v3.729+):
         *
         * AWS SDK v3 introduced automatic checksum injection (WHEN_SUPPORTED default)
         * which appends trailing CRC32 checksum data to PutObject requests using
         * HTTP chunked transfer encoding with trailers. S3-compatible providers such
         * as Backblaze B2, Cloudflare R2 (older), and MinIO do not implement the
         * AWS x-amz-checksum-* trailer protocol and reject these requests with
         * errors such as "request body was too small" (B2) or 400/InvalidRequest.
         *
         * Setting both to WHEN_REQUIRED instructs the SDK to only inject checksums
         * when the specific API operation mandates it (e.g. multipart upload
         * completion), matching the pre-v3.729 behavior universally compatible with
         * S3-compatible storage providers.
         */
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      };

      if (this.endpoint) {
        clientConfig.endpoint = this.endpoint;
      }

      if (this.configService.s3ForcePathStyle) {
        clientConfig.forcePathStyle = true;
      }

      this.s3Client = new S3Client(clientConfig);
    }
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const fileKey = `${crypto.randomUUID()}.pdf`;
    this.verifyKey(fileKey);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
          Body: input.buffer,
          /**
           * Explicit ContentLength is required for S3-compatible providers
           * (Backblaze B2, Cloudflare R2) when uploading a Buffer. Without an
           * explicit value, the AWS SDK may rely on chunked/trailer encoding to
           * defer the length, causing B2 to reject the request with "request
           * body was too small". Buffer.byteLength accurately reflects the
           * actual allocation size without guessing or hardcoding a value.
           */
          ContentLength: input.buffer.byteLength,
          ContentType: input.mimeType || 'application/pdf',
          Metadata: {
            studentId: input.studentId,
          },
        })
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to upload object to S3/R2 (${fileKey}): ${this.sanitizeErrorMessage(error)}`
      );
      throw new StorageError(
        `Failed to upload resume file to storage: ${this.sanitizeErrorMessage(error)}`,
        true,
        'STORAGE_UPLOAD_FAILED'
      );
    }

    const fileUrl = this.buildObjectUrl(fileKey);

    return {
      fileKey,
      fileUrl,
    };
  }

  async delete(fileKey: string): Promise<void> {
    this.verifyKey(fileKey);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        })
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to delete object from S3/R2 (${fileKey}): ${this.sanitizeErrorMessage(error)}`
      );
    }
  }

  async getBuffer(fileKey: string): Promise<Buffer> {
    this.verifyKey(fileKey);

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        })
      );

      if (!response.Body) {
        throw new StorageFileNotFoundError(
          fileKey,
          `Empty response body received from S3 for key: ${fileKey}`
        );
      }

      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageFileNotFoundError(fileKey);
      }
      if (error instanceof StorageError) {
        throw error;
      }
      this.logger.error(
        `Failed to read object from S3/R2 (${fileKey}): ${this.sanitizeErrorMessage(error)}`
      );
      throw new StorageError(
        `Failed to retrieve resume file from storage: ${this.sanitizeErrorMessage(error)}`,
        true,
        'STORAGE_READ_FAILED'
      );
    }
  }

  async getPresignedUrl(
    fileKey: string,
    expiresInSeconds = 900
  ): Promise<string> {
    this.verifyKey(fileKey);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate presigned URL for key (${fileKey}): ${this.sanitizeErrorMessage(error)}`
      );
      throw new StorageError(
        `Failed to generate access URL: ${this.sanitizeErrorMessage(error)}`,
        true,
        'STORAGE_PRESIGN_FAILED'
      );
    }
  }

  private verifyKey(fileKey: string): void {
    if (!/^[a-zA-Z0-9-]+\.pdf$/.test(fileKey)) {
      throw new StorageInvalidKeyError(
        fileKey,
        'Invalid storage file key format'
      );
    }
  }

  private isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const err = error as {
      name?: string;
      Code?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    return (
      err.name === 'NoSuchKey' ||
      err.name === 'NotFound' ||
      err.Code === 'NoSuchKey' ||
      err.code === 'NoSuchKey' ||
      err.$metadata?.httpStatusCode === 404
    );
  }

  private buildObjectUrl(fileKey: string): string {
    if (this.endpoint) {
      const base = this.endpoint.replace(/\/+$/, '');
      return `${base}/${this.bucket}/${fileKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${fileKey}`;
  }

  private sanitizeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      let msg = error.message;
      const secret = this.configService.s3SecretAccessKey;
      if (secret && secret.length >= 6) {
        msg = msg.split(secret).join('[REDACTED]');
      }
      const accessKey = this.configService.s3AccessKeyId;
      if (accessKey && accessKey.length >= 6) {
        msg = msg.split(accessKey).join('[REDACTED]');
      }
      return msg;
    }
    return String(error);
  }
}
