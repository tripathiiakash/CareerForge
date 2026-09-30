const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  B2NativeStorageProvider,
  B2_HTTP_CLIENT,
} = require('../dist/modules/resume/storage/b2-native-storage.provider');
const {
  StorageError,
  StorageFileNotFoundError,
  StorageInvalidKeyError,
  STORAGE_PROVIDER_TOKEN,
} = require('../dist/modules/resume/storage/storage.interface');
const { validateEnvironment } = require('../dist/core/config/config.validator');
const {
  LocalStorageProvider,
} = require('../dist/modules/resume/storage/local-storage.provider');
const {
  S3StorageProvider,
} = require('../dist/modules/resume/storage/s3-storage.provider');

describe('Backblaze B2 Native Storage Provider Test Suite', () => {
  const samplePdfBuffer = Buffer.from(
    '%PDF-1.4 Mock PDF binary content for testing B2 native'
  );
  const validStudentId = 'student-b2-uuid-1111-2222';

  const mockB2Config = {
    storageProvider: 'b2',
    b2KeyId: '003testkeyid123456789012',
    b2ApplicationKey: 'K003testAppKeySecret12345678901',
    b2BucketId: '4a6b8c0d2e4f6a8b0c2d4e6f',
    b2BucketName: 'careerforge-b2-resumes',
    port: 5000,
  };

  const createMockConfigService = (overrides = {}) => ({
    ...mockB2Config,
    ...overrides,
  });

  const baseValidEnv = {
    NODE_ENV: 'development',
    PORT: '5000',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/careerforge?schema=public',
    PG_BOSS_SCHEMA: 'pgboss',
    JWT_SECRET: 'test-jwt-secret-with-minimum-32-chars-long!',
  };

  const sampleAuthResponse = {
    authorizationToken: 'auth-token-xyz-123456789',
    apiUrl: 'https://api003.backblazeb2.com',
    downloadUrl: 'https://f003.backblazeb2.com',
    accountId: '003testkeyid123456789012',
  };

  const sampleUploadUrlResponse = {
    uploadUrl:
      'https://pod-003.backblazeb2.com/b2api/v3/b2_upload_file/upload-endpoint',
    authorizationToken: 'upload-auth-token-987654321',
    bucketId: '4a6b8c0d2e4f6a8b0c2d4e6f',
  };

  // Helper to create mock fetch responses
  const createMockFetch = (handlers) => {
    return async (url, options = {}) => {
      for (const handler of handlers) {
        const match = handler(url, options);
        if (match) {
          return match;
        }
      }
      throw new Error(
        `Unhandled mock fetch request: ${options.method || 'GET'} ${url}`
      );
    };
  };

  describe('1. Construction & Configuration', () => {
    it('should construct B2NativeStorageProvider with valid B2 configuration', () => {
      const configService = createMockConfigService();
      const provider = new B2NativeStorageProvider(configService);
      assert.ok(provider instanceof B2NativeStorageProvider);
      assert.equal(provider.keyId, mockB2Config.b2KeyId);
      assert.equal(provider.applicationKey, mockB2Config.b2ApplicationKey);
      assert.equal(provider.bucketId, mockB2Config.b2BucketId);
      assert.equal(provider.bucketName, mockB2Config.b2BucketName);
    });

    it('should throw an error if any required B2 configuration is missing', () => {
      const missingKeys = [
        'b2KeyId',
        'b2ApplicationKey',
        'b2BucketId',
        'b2BucketName',
      ];
      for (const key of missingKeys) {
        const configService = createMockConfigService({ [key]: undefined });
        assert.throws(
          () => new B2NativeStorageProvider(configService),
          (err) =>
            err.message.includes('B2NativeStorageProvider requires') &&
            err.message.includes('B2_KEY_ID')
        );
      }
    });

    it('should accept an injected customFetch function for test isolation', () => {
      const configService = createMockConfigService();
      const mockFetch = async () => ({ ok: true });
      const provider = new B2NativeStorageProvider(configService, mockFetch);
      assert.ok(provider instanceof B2NativeStorageProvider);
    });
  });

  describe('2. Authorization (b2_authorize_account)', () => {
    it('should send Basic auth header with base64 credentials to B2_AUTH_URL', async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
          ok: true,
          status: 200,
          json: async () => sampleAuthResponse,
        };
      };

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const authState = await provider.authorize();

      assert.equal(capturedUrl, B2NativeStorageProvider.B2_AUTH_URL);
      assert.equal(capturedOptions.method, 'GET');

      const expectedBasic = Buffer.from(
        `${mockB2Config.b2KeyId}:${mockB2Config.b2ApplicationKey}`
      ).toString('base64');
      assert.equal(
        capturedOptions.headers.Authorization,
        `Basic ${expectedBasic}`
      );

      assert.equal(
        authState.authorizationToken,
        sampleAuthResponse.authorizationToken
      );
      assert.equal(authState.apiUrl, sampleAuthResponse.apiUrl);
      assert.equal(authState.downloadUrl, sampleAuthResponse.downloadUrl);
    });

    it('should cache authorization response in memory and reuse within TTL', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => sampleAuthResponse,
        };
      };

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      const auth1 = await provider.authorize();
      const auth2 = await provider.authorize();

      assert.equal(
        callCount,
        1,
        'Subsequent authorize calls within TTL must reuse cached token'
      );
      assert.equal(auth1, auth2);
    });

    it('should force refresh authorization when forceRefresh is true', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...sampleAuthResponse,
            authorizationToken: `token-${callCount}`,
          }),
        };
      };

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      const auth1 = await provider.authorize();
      assert.equal(auth1.authorizationToken, 'token-1');

      const auth2 = await provider.authorize(true);
      assert.equal(callCount, 2);
      assert.equal(auth2.authorizationToken, 'token-2');
    });

    it('should refresh authorization proactively when token expires past TTL', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => sampleAuthResponse,
        };
      };

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      await provider.authorize();

      // Simulate expired token in cache
      provider.authState.fetchedAt =
        Date.now() - (B2NativeStorageProvider.TOKEN_TTL_MS + 1000);

      await provider.authorize();
      assert.equal(
        callCount,
        2,
        'Expired token past TTL must trigger a new authorize request'
      );
    });

    it('should throw non-retryable StorageError on 401 unauthorized auth response', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 401,
        text: async () => '{"code": "unauthorized", "message": "bad keys"}',
      });

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () => provider.authorize(),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.code, 'STORAGE_AUTH_FAILED');
          assert.equal(err.isRetryable, false);
          return true;
        }
      );
    });

    it('should handle malformed non-JSON auth response', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      });

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () => provider.authorize(),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.code, 'STORAGE_AUTH_FAILED');
          assert.ok(err.message.includes('valid JSON'));
          return true;
        }
      );
    });

    it('should throw when auth response is missing required fields', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ accountId: '123' }), // missing authorizationToken, apiUrl, downloadUrl
      });

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () => provider.authorize(),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.code, 'STORAGE_AUTH_FAILED');
          assert.ok(err.message.includes('missing required fields'));
          return true;
        }
      );
    });
  });

  describe('3. Upload URL Resolution (b2_get_upload_url)', () => {
    it('should call b2_get_upload_url with bucketId and account auth token', async () => {
      let uploadUrlPayload = null;
      let uploadUrlHeaders = null;

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url, opts) => {
          if (url.includes('b2_get_upload_url')) {
            uploadUrlHeaders = opts.headers;
            uploadUrlPayload = JSON.parse(opts.body);
            return {
              ok: true,
              status: 200,
              json: async () => sampleUploadUrlResponse,
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const res = await provider.getUploadUrl();

      assert.equal(res.uploadUrl, sampleUploadUrlResponse.uploadUrl);
      assert.equal(
        res.authorizationToken,
        sampleUploadUrlResponse.authorizationToken
      );
      assert.equal(uploadUrlPayload.bucketId, mockB2Config.b2BucketId);
      assert.equal(
        uploadUrlHeaders.Authorization,
        sampleAuthResponse.authorizationToken
      );
    });

    it('should refresh account token and retry when b2_get_upload_url returns 401', async () => {
      let authCallCount = 0;
      let getUploadUrlCallCount = 0;

      const mockFetch = createMockFetch([
        (url) => {
          if (url === B2NativeStorageProvider.B2_AUTH_URL) {
            authCallCount++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                ...sampleAuthResponse,
                authorizationToken: `auth-token-v${authCallCount}`,
              }),
            };
          }
        },
        (url, opts) => {
          if (url.includes('b2_get_upload_url')) {
            getUploadUrlCallCount++;
            if (getUploadUrlCallCount === 1) {
              return {
                ok: false,
                status: 401,
                text: async () => '{"code": "expired_auth_token"}',
              };
            }
            assert.equal(opts.headers.Authorization, 'auth-token-v2');
            return {
              ok: true,
              status: 200,
              json: async () => sampleUploadUrlResponse,
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const res = await provider.getUploadUrl();

      assert.equal(authCallCount, 2, 'Should refresh authorization on 401');
      assert.equal(getUploadUrlCallCount, 2, 'Should retry getUploadUrl once');
      assert.equal(res.uploadUrl, sampleUploadUrlResponse.uploadUrl);
    });

    it('should throw StorageError when b2_get_upload_url fails with 500', async () => {
      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('b2_get_upload_url') && {
            ok: false,
            status: 500,
            text: async () => 'Service unavailable',
          },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () => provider.getUploadUrl(),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.code, 'STORAGE_UPLOAD_FAILED');
          assert.equal(err.isRetryable, true);
          return true;
        }
      );
    });
  });

  describe('4. Upload Execution (b2_upload_file)', () => {
    it('should send POST with exact Content-Length, SHA-1, studentId, and UUID PDF key', async () => {
      let capturedUploadHeaders = null;
      let capturedUploadBody = null;
      let capturedUploadUrl = null;

      const expectedSha1 = crypto
        .createHash('sha1')
        .update(samplePdfBuffer)
        .digest('hex');

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('b2_get_upload_url') && {
            ok: true,
            status: 200,
            json: async () => sampleUploadUrlResponse,
          },
        (url, opts) => {
          if (url === sampleUploadUrlResponse.uploadUrl) {
            capturedUploadUrl = url;
            capturedUploadHeaders = opts.headers;
            capturedUploadBody = opts.body;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                fileId: '4_z4a6b8c0d2e4f_f1001',
                fileName: decodeURIComponent(opts.headers['X-Bz-File-Name']),
                contentLength: samplePdfBuffer.byteLength,
              }),
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const result = await provider.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'Candidate_Resume.pdf',
        studentId: validStudentId,
      });

      // Verify request properties
      assert.equal(capturedUploadUrl, sampleUploadUrlResponse.uploadUrl);
      assert.equal(
        capturedUploadHeaders.Authorization,
        sampleUploadUrlResponse.authorizationToken
      );
      assert.equal(
        capturedUploadHeaders['Content-Length'],
        String(samplePdfBuffer.byteLength)
      );
      assert.equal(capturedUploadHeaders['X-Bz-Content-Sha1'], expectedSha1);
      assert.equal(capturedUploadHeaders['Content-Type'], 'application/pdf');
      assert.equal(
        capturedUploadHeaders['X-Bz-Info-studentid'],
        encodeURIComponent(validStudentId)
      );
      assert.ok(
        /^[0-9a-f-]{36}\.pdf$/i.test(
          decodeURIComponent(capturedUploadHeaders['X-Bz-File-Name'])
        )
      );
      assert.equal(capturedUploadBody, samplePdfBuffer);

      // Verify return result shape
      assert.ok(/^[0-9a-f-]{36}\.pdf$/i.test(result.fileKey));
      assert.equal(
        result.fileUrl,
        `https://f003.backblazeb2.com/file/${encodeURIComponent(mockB2Config.b2BucketName)}/${encodeURIComponent(result.fileKey)}`
      );
    });

    it('should recover from expired upload URL by requesting a fresh URL and retrying upload', async () => {
      let uploadUrlRequests = 0;
      let uploadAttempts = 0;

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) => {
          if (url.includes('b2_get_upload_url')) {
            uploadUrlRequests++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                ...sampleUploadUrlResponse,
                uploadUrl: `https://upload.backblazeb2.com/endpoint-${uploadUrlRequests}`,
                authorizationToken: `upload-token-${uploadUrlRequests}`,
              }),
            };
          }
        },
        (url) => {
          if (url.includes('endpoint-')) {
            uploadAttempts++;
            if (uploadAttempts === 1) {
              // First attempt: upload endpoint rejected token (HTTP 401)
              return {
                ok: false,
                status: 401,
                text: async () => '{"code": "bad_auth_token"}',
              };
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                fileId: 'file-id-retry',
                fileName: 'retry.pdf',
                contentLength: samplePdfBuffer.byteLength,
              }),
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const result = await provider.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'test.pdf',
        studentId: validStudentId,
      });

      assert.equal(uploadAttempts, 2, 'Should attempt upload twice');
      assert.equal(
        uploadUrlRequests,
        2,
        'Should fetch a fresh upload URL on retry'
      );
      assert.ok(result.fileKey.endsWith('.pdf'));
    });

    it('should wrap upload failure in StorageError after retries exhausted', async () => {
      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('b2_get_upload_url') && {
            ok: true,
            status: 200,
            json: async () => sampleUploadUrlResponse,
          },
        (url) =>
          url === sampleUploadUrlResponse.uploadUrl && {
            ok: false,
            status: 500,
            text: async () => 'Internal server error in storage pod',
          },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () =>
          provider.upload({
            buffer: samplePdfBuffer,
            mimeType: 'application/pdf',
            originalName: 'test.pdf',
            studentId: validStudentId,
          }),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.code, 'STORAGE_UPLOAD_FAILED');
          return true;
        }
      );
    });

    it('should reject invalid upload response missing fileName', async () => {
      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('b2_get_upload_url') && {
            ok: true,
            status: 200,
            json: async () => sampleUploadUrlResponse,
          },
        (url) =>
          url === sampleUploadUrlResponse.uploadUrl && {
            ok: true,
            status: 200,
            json: async () => ({ contentLength: 123 }), // missing fileName
          },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () =>
          provider.upload({
            buffer: samplePdfBuffer,
            mimeType: 'application/pdf',
            originalName: 'test.pdf',
            studentId: validStudentId,
          }),
        (err) => {
          assert.ok(err instanceof StorageError);
          return true;
        }
      );
    });
  });

  describe('5. Download (getBuffer)', () => {
    const testFileKey = '11112222-3333-4444-5555-666677778888.pdf';

    it('should fetch file using native authenticated download API and return Buffer', async () => {
      let downloadUrl = null;
      let downloadHeaders = null;

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url, opts) => {
          if (url.includes('/file/')) {
            downloadUrl = url;
            downloadHeaders = opts.headers;
            return {
              ok: true,
              status: 200,
              arrayBuffer: async () =>
                samplePdfBuffer.buffer.slice(
                  samplePdfBuffer.byteOffset,
                  samplePdfBuffer.byteOffset + samplePdfBuffer.byteLength
                ),
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const buffer = await provider.getBuffer(testFileKey);

      assert.equal(
        downloadUrl,
        `https://f003.backblazeb2.com/file/${encodeURIComponent(mockB2Config.b2BucketName)}/${encodeURIComponent(testFileKey)}`
      );
      assert.equal(
        downloadHeaders.Authorization,
        sampleAuthResponse.authorizationToken
      );
      assert.deepEqual(buffer, samplePdfBuffer);
    });

    it('should refresh token and retry once when download returns 401', async () => {
      let authCount = 0;
      let downloadCount = 0;

      const mockFetch = createMockFetch([
        (url) => {
          if (url === B2NativeStorageProvider.B2_AUTH_URL) {
            authCount++;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                ...sampleAuthResponse,
                authorizationToken: `token-download-${authCount}`,
              }),
            };
          }
        },
        (url, opts) => {
          if (url.includes('/file/')) {
            downloadCount++;
            if (downloadCount === 1) {
              return {
                ok: false,
                status: 401,
                text: async () => '{"code": "expired_auth_token"}',
              };
            }
            assert.equal(opts.headers.Authorization, 'token-download-2');
            return {
              ok: true,
              status: 200,
              arrayBuffer: async () =>
                samplePdfBuffer.buffer.slice(
                  samplePdfBuffer.byteOffset,
                  samplePdfBuffer.byteOffset + samplePdfBuffer.byteLength
                ),
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const buffer = await provider.getBuffer(testFileKey);

      assert.equal(authCount, 2, 'Should refresh authorization on 401');
      assert.equal(downloadCount, 2, 'Should retry download once');
      assert.deepEqual(buffer, samplePdfBuffer);
    });

    it('should map HTTP 404 to StorageFileNotFoundError', async () => {
      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('/file/') && {
            ok: false,
            status: 404,
            text: async () =>
              '{"code": "not_found", "message": "File not found"}',
          },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );

      await assert.rejects(
        () => provider.getBuffer(testFileKey),
        (err) => {
          assert.ok(err instanceof StorageFileNotFoundError);
          assert.equal(err.fileKey, testFileKey);
          return true;
        }
      );
    });

    it('should throw StorageInvalidKeyError on path traversal attempt in getBuffer', async () => {
      const provider = new B2NativeStorageProvider(createMockConfigService());

      await assert.rejects(
        () => provider.getBuffer('../traversal.pdf'),
        (err) => err instanceof StorageInvalidKeyError
      );
    });

    it('should throw StorageInvalidKeyError on non-pdf extension in getBuffer', async () => {
      const provider = new B2NativeStorageProvider(createMockConfigService());

      await assert.rejects(
        () => provider.getBuffer('valid-uuid-file.exe'),
        (err) => err instanceof StorageInvalidKeyError
      );
    });
  });

  describe('6. Presigned Download URL (getPresignedUrl)', () => {
    const testFileKey = '22223333-4444-5555-6666-777788889999.pdf';

    it('should obtain download authorization token and return signed URL', async () => {
      let capturedPayload = null;

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url, opts) => {
          if (url.includes('b2_get_download_authorization')) {
            capturedPayload = JSON.parse(opts.body);
            return {
              ok: true,
              status: 200,
              json: async () => ({
                authorizationToken: 'download-auth-jwt-token',
              }),
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      const url = await provider.getPresignedUrl(testFileKey, 1200);

      assert.equal(capturedPayload.bucketId, mockB2Config.b2BucketId);
      assert.equal(capturedPayload.fileNamePrefix, testFileKey);
      assert.equal(capturedPayload.validDurationInSeconds, 1200);
      assert.equal(
        url,
        `https://f003.backblazeb2.com/file/${encodeURIComponent(mockB2Config.b2BucketName)}/${encodeURIComponent(testFileKey)}?Authorization=download-auth-jwt-token`
      );
    });

    it('should reject invalid key in getPresignedUrl', async () => {
      const provider = new B2NativeStorageProvider(createMockConfigService());

      await assert.rejects(
        () => provider.getPresignedUrl('malicious/path.pdf'),
        (err) => err instanceof StorageInvalidKeyError
      );
    });
  });

  describe('7. Delete Operation (b2_delete_file_version)', () => {
    const testFileKey = '33334444-5555-6666-7777-888899990000.pdf';
    const testFileId = '4_z4a6b8c0d2e4f_f100199';

    it('should resolve fileId via b2_list_file_names and call b2_delete_file_version', async () => {
      let listPayload = null;
      let deletePayload = null;

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url, opts) => {
          if (url.includes('b2_list_file_names')) {
            listPayload = JSON.parse(opts.body);
            return {
              ok: true,
              status: 200,
              json: async () => ({
                files: [{ fileId: testFileId, fileName: testFileKey }],
              }),
            };
          }
        },
        (url, opts) => {
          if (url.includes('b2_delete_file_version')) {
            deletePayload = JSON.parse(opts.body);
            return {
              ok: true,
              status: 200,
              json: async () => ({ fileId: testFileId, fileName: testFileKey }),
            };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      await provider.delete(testFileKey);

      assert.equal(listPayload.bucketId, mockB2Config.b2BucketId);
      assert.equal(listPayload.prefix, testFileKey);
      assert.equal(deletePayload.fileName, testFileKey);
      assert.equal(deletePayload.fileId, testFileId);
    });

    it('should treat not-found files as already deleted (best-effort)', async () => {
      let deleteCalled = false;

      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('b2_list_file_names') && {
            ok: true,
            status: 200,
            json: async () => ({ files: [] }), // No files found
          },
        (url) => {
          if (url.includes('b2_delete_file_version')) {
            deleteCalled = true;
            return { ok: true, status: 200, json: async () => ({}) };
          }
        },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      await provider.delete(testFileKey);

      assert.equal(
        deleteCalled,
        false,
        'Should skip b2_delete_file_version if file is not found'
      );
    });

    it('should gracefully handle deletion failure without crashing caller (best-effort)', async () => {
      const mockFetch = createMockFetch([
        (url) =>
          url === B2NativeStorageProvider.B2_AUTH_URL && {
            ok: true,
            status: 200,
            json: async () => sampleAuthResponse,
          },
        (url) =>
          url.includes('b2_list_file_names') && {
            ok: true,
            status: 200,
            json: async () => ({
              files: [{ fileId: testFileId, fileName: testFileKey }],
            }),
          },
        (url) =>
          url.includes('b2_delete_file_version') && {
            ok: false,
            status: 500,
            text: async () => 'Delete failed',
          },
      ]);

      const provider = new B2NativeStorageProvider(
        createMockConfigService(),
        mockFetch
      );
      // Must not throw
      await provider.delete(testFileKey);
    });

    it('should throw StorageInvalidKeyError on malformed key in delete', async () => {
      const provider = new B2NativeStorageProvider(createMockConfigService());

      await assert.rejects(
        () => provider.delete('../traversal.pdf'),
        (err) => err instanceof StorageInvalidKeyError
      );
    });
  });

  describe('8. Secret Redaction & Log Hygiene', () => {
    it('should redact keyId, applicationKey, base64 credentials, and auth tokens from error output', () => {
      const provider = new B2NativeStorageProvider(createMockConfigService());
      provider.authState = {
        authorizationToken: 'sensitive-b2-auth-token-12345',
        apiUrl: 'https://api.backblazeb2.com',
        downloadUrl: 'https://f000.backblazeb2.com',
        fetchedAt: Date.now(),
      };

      const credentials = Buffer.from(
        `${mockB2Config.b2KeyId}:${mockB2Config.b2ApplicationKey}`
      ).toString('base64');

      const rawError =
        `Failed with keyId ${mockB2Config.b2KeyId} and key ${mockB2Config.b2ApplicationKey} ` +
        `using Basic ${credentials} and authorizationToken: "sensitive-b2-auth-token-12345"`;

      const sanitized = provider.sanitize(rawError);

      assert.ok(
        !sanitized.includes(mockB2Config.b2KeyId),
        'keyId must be redacted'
      );
      assert.ok(
        !sanitized.includes(mockB2Config.b2ApplicationKey),
        'applicationKey must be redacted'
      );
      assert.ok(
        !sanitized.includes(credentials),
        'base64 credentials must be redacted'
      );
      assert.ok(
        !sanitized.includes('sensitive-b2-auth-token-12345'),
        'auth token must be redacted'
      );
      assert.ok(sanitized.includes('[REDACTED]'));
      assert.ok(sanitized.includes('[REDACTED_TOKEN]'));
    });
  });

  describe('9. Environment Validation & Configuration Support', () => {
    it('should validate STORAGE_PROVIDER=b2 when all B2 variables are supplied', () => {
      const config = validateEnvironment({
        ...baseValidEnv,
        STORAGE_PROVIDER: 'b2',
        B2_KEY_ID: '003testkeyid123456789012',
        B2_APPLICATION_KEY: 'K003testAppKeySecret12345678901',
        B2_BUCKET_ID: '4a6b8c0d2e4f6a8b0c2d4e6f',
        B2_BUCKET_NAME: 'careerforge-b2-resumes',
      });

      assert.equal(config.storageProvider, 'b2');
      assert.equal(config.b2KeyId, '003testkeyid123456789012');
      assert.equal(config.b2ApplicationKey, 'K003testAppKeySecret12345678901');
      assert.equal(config.b2BucketId, '4a6b8c0d2e4f6a8b0c2d4e6f');
      assert.equal(config.b2BucketName, 'careerforge-b2-resumes');
    });

    it('should require B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_ID, B2_BUCKET_NAME when STORAGE_PROVIDER=b2', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...baseValidEnv,
            STORAGE_PROVIDER: 'b2',
          }),
        (err) =>
          err.message.includes('B2_KEY_ID is required') &&
          err.message.includes('B2_APPLICATION_KEY is required') &&
          err.message.includes('B2_BUCKET_ID is required') &&
          err.message.includes('B2_BUCKET_NAME is required')
      );
    });

    it('should reject placeholder B2 credentials in production mode', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...baseValidEnv,
            NODE_ENV: 'production',
            JWT_SECRET: 'a'.repeat(32),
            STORAGE_PROVIDER: 'b2',
            B2_KEY_ID: 'your-b2-key-id',
            B2_APPLICATION_KEY: 'your-b2-application-key',
            B2_BUCKET_ID: 'your-b2-bucket-id',
            B2_BUCKET_NAME: 'your-b2-bucket-name',
          }),
        (err) =>
          err.message.includes('B2_KEY_ID must not use placeholder') &&
          err.message.includes('B2_APPLICATION_KEY must not use placeholder') &&
          err.message.includes('B2_BUCKET_ID must not use placeholder') &&
          err.message.includes('B2_BUCKET_NAME must not use placeholder')
      );
    });

    it('should not require B2 variables when STORAGE_PROVIDER is local or s3', () => {
      // Local
      const localConfig = validateEnvironment({
        ...baseValidEnv,
        STORAGE_PROVIDER: 'local',
      });
      assert.equal(localConfig.storageProvider, 'local');
      assert.equal(localConfig.b2KeyId, undefined);

      // S3
      const s3Config = validateEnvironment({
        ...baseValidEnv,
        STORAGE_PROVIDER: 's3',
        S3_BUCKET: 'cf-s3-resumes',
        S3_ACCESS_KEY_ID: 's3-key-id',
        S3_SECRET_ACCESS_KEY: 's3-secret-key',
      });
      assert.equal(s3Config.storageProvider, 's3');
      assert.equal(s3Config.b2KeyId, undefined);
    });
  });

  describe('10. ResumeModule DI Provider Selection & HTTP Client Token', () => {
    const { ResumeModule } = require('../dist/modules/resume/resume.module');
    const providers = Reflect.getMetadata('providers', ResumeModule) || [];
    const storageProviderRegistration = providers.find(
      (p) => p && typeof p === 'object' && p.provide === STORAGE_PROVIDER_TOKEN
    );
    const httpClientRegistration = providers.find(
      (p) => p && typeof p === 'object' && p.provide === B2_HTTP_CLIENT
    );

    it('should export B2_HTTP_CLIENT Symbol token', () => {
      assert.equal(typeof B2_HTTP_CLIENT, 'symbol');
    });

    it('should register B2_HTTP_CLIENT provider with globalThis.fetch in ResumeModule', () => {
      assert.ok(
        httpClientRegistration,
        'B2_HTTP_CLIENT provider must be registered in ResumeModule'
      );
      assert.equal(httpClientRegistration.useValue, globalThis.fetch);
    });

    it('should have registered STORAGE_PROVIDER_TOKEN factory in ResumeModule', () => {
      assert.ok(
        storageProviderRegistration,
        'STORAGE_PROVIDER_TOKEN provider must be registered'
      );
      assert.equal(typeof storageProviderRegistration.useFactory, 'function');
    });

    it('should instantiate B2NativeStorageProvider when storageProvider is "b2"', () => {
      const mockConfig = createMockConfigService({ storageProvider: 'b2' });
      const instance = storageProviderRegistration.useFactory(mockConfig);
      assert.ok(instance instanceof B2NativeStorageProvider);
    });

    it('should reuse injected b2Provider when provided to useFactory', () => {
      const mockConfig = createMockConfigService({ storageProvider: 'b2' });
      const existingB2Instance = new B2NativeStorageProvider(mockConfig);
      const instance = storageProviderRegistration.useFactory(
        mockConfig,
        existingB2Instance
      );
      assert.equal(instance, existingB2Instance);
    });

    it('should instantiate S3StorageProvider when storageProvider is "s3"', () => {
      const mockConfig = {
        storageProvider: 's3',
        s3Endpoint: 'https://r2.cloudflarestorage.com',
        s3Region: 'auto',
        s3Bucket: 'test-bucket',
        s3AccessKeyId: 'test-key',
        s3SecretAccessKey: 'test-secret',
        port: 5000,
      };
      const instance = storageProviderRegistration.useFactory(mockConfig);
      assert.ok(instance instanceof S3StorageProvider);
    });

    it('should instantiate LocalStorageProvider when storageProvider is "local"', () => {
      const mockConfig = { storageProvider: 'local', port: 5000 };
      const instance = storageProviderRegistration.useFactory(mockConfig);
      assert.ok(instance instanceof LocalStorageProvider);
    });
  });
});
