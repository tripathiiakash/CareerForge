const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { S3StorageProvider } = require('../dist/modules/resume/storage/s3-storage.provider');
const { LocalStorageProvider } = require('../dist/modules/resume/storage/local-storage.provider');
const {
  StorageError,
  StorageFileNotFoundError,
  StorageInvalidKeyError,
  STORAGE_PROVIDER_TOKEN,
} = require('../dist/modules/resume/storage/storage.interface');
const { validateEnvironment } = require('../dist/core/config/config.validator');
const { ResumeService } = require('../dist/modules/resume/resume.service');
const { ResumeStorageService } = require('../dist/modules/resume/storage/resume-storage.service');

describe('S3 / Cloudflare R2 Storage Provider Test Suite', () => {
  const samplePdfBuffer = Buffer.from('%PDF-1.4 Mock PDF binary content for testing');
  const validStudentId = 'student-uuid-1111-2222';

  const createMockConfigService = (overrides = {}) => ({
    storageProvider: 's3',
    s3Endpoint: 'https://test-account-id.r2.cloudflarestorage.com',
    s3Region: 'auto',
    s3Bucket: 'careerforge-test-resumes',
    s3AccessKeyId: 'test-r2-access-key-id',
    s3SecretAccessKey: 'test-r2-secret-access-key-xyz123',
    s3ForcePathStyle: false,
    port: 5000,
    ...overrides,
  });

  describe('1. Construction & Configuration', () => {
    it('should construct S3StorageProvider with custom R2 endpoint and credentials', () => {
      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService);
      assert.ok(provider instanceof S3StorageProvider);
    });

    it('should construct S3StorageProvider with standard AWS S3 configuration', () => {
      const configService = createMockConfigService({
        s3Endpoint: undefined,
        s3Region: 'us-east-1',
        s3Bucket: 'aws-s3-resumes',
      });
      const provider = new S3StorageProvider(configService);
      assert.ok(provider instanceof S3StorageProvider);
    });

    it('should accept an injected S3Client for testing', () => {
      const configService = createMockConfigService();
      const mockClient = { send: async () => ({}) };
      const provider = new S3StorageProvider(configService, mockClient);
      assert.ok(provider instanceof S3StorageProvider);
    });
  });

  describe('2. Upload Operation', () => {
    it('should send PutObjectCommand with correct bucket, UUID key, body, and metadata', async () => {
      let capturedCommand = null;
      const mockClient = {
        send: async (command) => {
          capturedCommand = command;
          return {};
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      const result = await provider.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'My_Resume.pdf',
        studentId: validStudentId,
      });

      // Verify command payload
      assert.ok(capturedCommand);
      assert.equal(capturedCommand.input.Bucket, 'careerforge-test-resumes');
      assert.ok(/^[0-9a-f-]{36}\.pdf$/i.test(capturedCommand.input.Key));
      assert.equal(capturedCommand.input.Body, samplePdfBuffer);
      assert.equal(capturedCommand.input.ContentType, 'application/pdf');
      assert.equal(capturedCommand.input.Metadata.studentId, validStudentId);

      // Verify result
      assert.equal(result.fileKey, capturedCommand.input.Key);
      assert.equal(
        result.fileUrl,
        `https://test-account-id.r2.cloudflarestorage.com/careerforge-test-resumes/${result.fileKey}`
      );
    });

    it('should format AWS S3 fileUrl correctly when custom endpoint is not set', async () => {
      const mockClient = { send: async () => ({}) };
      const configService = createMockConfigService({
        s3Endpoint: undefined,
        s3Region: 'us-west-2',
        s3Bucket: 'my-s3-bucket',
      });
      const provider = new S3StorageProvider(configService, mockClient);

      const result = await provider.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'Resume.pdf',
        studentId: validStudentId,
      });

      assert.equal(
        result.fileUrl,
        `https://my-s3-bucket.s3.us-west-2.amazonaws.com/${result.fileKey}`
      );
    });

    it('should never include credentials or signature parameters in returned fileUrl', async () => {
      const mockClient = { send: async () => ({}) };
      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      const result = await provider.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'Resume.pdf',
        studentId: validStudentId,
      });

      assert.equal(result.fileUrl.includes('test-r2-access-key-id'), false);
      assert.equal(result.fileUrl.includes('test-r2-secret-access-key-xyz123'), false);
      assert.equal(result.fileUrl.includes('X-Amz-'), false);
    });

    it('should wrap S3 PutObject failure into StorageError without leaking secrets', async () => {
      const mockClient = {
        send: async () => {
          const err = new Error(
            'AWS PutObject failed with secret test-r2-secret-access-key-xyz123 and key test-r2-access-key-id'
          );
          throw err;
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () =>
          provider.upload({
            buffer: samplePdfBuffer,
            mimeType: 'application/pdf',
            originalName: 'Resume.pdf',
            studentId: validStudentId,
          }),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.isRetryable, true);
          assert.equal(err.code, 'STORAGE_UPLOAD_FAILED');
          assert.equal(err.message.includes('test-r2-secret-access-key-xyz123'), false);
          assert.ok(err.message.includes('[REDACTED]'));
          return true;
        }
      );
    });
  });

  describe('3. Download / Read Operation (getBuffer)', () => {
    it('should send GetObjectCommand with correct bucket/key and return Buffer', async () => {
      let capturedCommand = null;
      const expectedBytes = Buffer.from('Extracted PDF binary bytes');
      const mockClient = {
        send: async (command) => {
          capturedCommand = command;
          return {
            Body: {
              transformToByteArray: async () => expectedBytes,
            },
          };
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);
      const testFileKey = '12345678-1234-1234-1234-123456789abc.pdf';

      const buffer = await provider.getBuffer(testFileKey);

      assert.ok(capturedCommand);
      assert.equal(capturedCommand.input.Bucket, 'careerforge-test-resumes');
      assert.equal(capturedCommand.input.Key, testFileKey);
      assert.deepEqual(buffer, expectedBytes);
    });

    it('should throw StorageInvalidKeyError on path traversal attempt in getBuffer', async () => {
      const mockClient = { send: async () => ({}) };
      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () => provider.getBuffer('../../secret.pdf'),
        (err) => {
          assert.ok(err instanceof StorageInvalidKeyError);
          assert.equal(err.isRetryable, false);
          assert.equal(err.code, 'INVALID_FILE_KEY');
          return true;
        }
      );
    });

    it('should throw StorageInvalidKeyError on non-pdf extension in getBuffer', async () => {
      const mockClient = { send: async () => ({}) };
      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () => provider.getBuffer('evil-script.sh'),
        (err) => {
          assert.ok(err instanceof StorageInvalidKeyError);
          return true;
        }
      );
    });

    it('should map S3 NoSuchKey error to StorageFileNotFoundError (non-retryable)', async () => {
      const mockClient = {
        send: async () => {
          const err = new Error('The specified key does not exist.');
          err.name = 'NoSuchKey';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);
      const testFileKey = 'missing-file-1234-5678.pdf';

      await assert.rejects(
        () => provider.getBuffer(testFileKey),
        (err) => {
          assert.ok(err instanceof StorageFileNotFoundError);
          assert.equal(err.isRetryable, false);
          assert.equal(err.code, 'FILE_NOT_FOUND');
          assert.equal(err.fileKey, testFileKey);
          return true;
        }
      );
    });

    it('should map S3 NotFound error to StorageFileNotFoundError', async () => {
      const mockClient = {
        send: async () => {
          const err = new Error('Not Found');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);
      const testFileKey = 'missing-file-404.pdf';

      await assert.rejects(
        () => provider.getBuffer(testFileKey),
        (err) => {
          assert.ok(err instanceof StorageFileNotFoundError);
          return true;
        }
      );
    });

    it('should map HTTP 404 status code error to StorageFileNotFoundError', async () => {
      const mockClient = {
        send: async () => {
          const err = new Error('Resource not found');
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () => provider.getBuffer('notfound-123.pdf'),
        (err) => err instanceof StorageFileNotFoundError
      );
    });

    it('should throw StorageFileNotFoundError if S3 response Body is missing', async () => {
      const mockClient = {
        send: async () => ({ Body: null }),
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () => provider.getBuffer('empty-body-123.pdf'),
        (err) => err instanceof StorageFileNotFoundError
      );
    });

    it('should wrap unexpected S3 network error into retryable StorageError', async () => {
      const mockClient = {
        send: async () => {
          const err = new Error('Connection timeout to S3 endpoint');
          err.name = 'TimeoutError';
          throw err;
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () => provider.getBuffer('timeout-file.pdf'),
        (err) => {
          assert.ok(err instanceof StorageError);
          assert.equal(err.isRetryable, true);
          assert.equal(err.code, 'STORAGE_READ_FAILED');
          return true;
        }
      );
    });
  });

  describe('4. Delete Operation', () => {
    it('should send DeleteObjectCommand with correct bucket/key', async () => {
      let capturedCommand = null;
      const mockClient = {
        send: async (command) => {
          capturedCommand = command;
          return {};
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);
      const testFileKey = 'delete-me-1234-5678.pdf';

      await provider.delete(testFileKey);

      assert.ok(capturedCommand);
      assert.equal(capturedCommand.input.Bucket, 'careerforge-test-resumes');
      assert.equal(capturedCommand.input.Key, testFileKey);
    });

    it('should throw StorageInvalidKeyError on malformed key in delete', async () => {
      const mockClient = { send: async () => ({}) };
      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      await assert.rejects(
        () => provider.delete('../malicious.pdf'),
        (err) => err instanceof StorageInvalidKeyError
      );
    });

    it('should gracefully handle SDK errors during delete without crashing', async () => {
      const mockClient = {
        send: async () => {
          throw new Error('S3 delete warning');
        },
      };

      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService, mockClient);

      // S3 delete does not rethrow on failure; logs warning
      await provider.delete('file-to-delete.pdf');
      assert.ok(true, 'Delete completed without throwing');
    });
  });

  describe('5. Presigned URL Generation Helper', () => {
    it('should reject malformed key before presigning', async () => {
      const configService = createMockConfigService();
      const provider = new S3StorageProvider(configService);

      await assert.rejects(
        () => provider.getPresignedUrl('../bad-key.pdf'),
        (err) => err instanceof StorageInvalidKeyError
      );
    });

    it('should generate valid presigned URL offline for valid file key', async () => {
      const configService = createMockConfigService({
        s3Endpoint: undefined,
        s3Region: 'us-east-1',
        s3Bucket: 'cf-presign-bucket',
        s3AccessKeyId: 'test-ak',
        s3SecretAccessKey: 'test-secret-long-enough-for-signing',
      });
      const provider = new S3StorageProvider(configService);
      const testFileKey = '11111111-2222-3333-4444-555555555555.pdf';

      const url = await provider.getPresignedUrl(testFileKey, 600);

      assert.ok(typeof url === 'string');
      assert.ok(url.startsWith('https://cf-presign-bucket.s3.us-east-1.amazonaws.com/11111111-2222-3333-4444-555555555555.pdf'));
      assert.ok(url.includes('X-Amz-Signature='));
      assert.ok(url.includes('X-Amz-Expires=600'));
    });
  });

  describe('6. Environment Validation & Configuration Support', () => {
    const baseValidEnv = {
      NODE_ENV: 'test',
      PORT: '5000',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
      JWT_SECRET: 'test-jwt-secret-min-32-characters-long',
    };

    it('should default to STORAGE_PROVIDER=local and require no S3 variables', () => {
      const config = validateEnvironment(baseValidEnv);
      assert.equal(config.storageProvider, 'local');
      assert.equal(config.s3Bucket, undefined);
      assert.equal(config.s3AccessKeyId, undefined);
    });

    it('should validate STORAGE_PROVIDER=s3 with S3_* variable names', () => {
      const config = validateEnvironment({
        ...baseValidEnv,
        STORAGE_PROVIDER: 's3',
        S3_ENDPOINT: 'https://my-r2.cloudflarestorage.com',
        S3_REGION: 'auto',
        S3_BUCKET: 'prod-bucket',
        S3_ACCESS_KEY_ID: 'real-access-key-id',
        S3_SECRET_ACCESS_KEY: 'real-secret-access-key',
      });

      assert.equal(config.storageProvider, 's3');
      assert.equal(config.s3Endpoint, 'https://my-r2.cloudflarestorage.com');
      assert.equal(config.s3Region, 'auto');
      assert.equal(config.s3Bucket, 'prod-bucket');
      assert.equal(config.s3AccessKeyId, 'real-access-key-id');
      assert.equal(config.s3SecretAccessKey, 'real-secret-access-key');
    });

    it('should validate STORAGE_PROVIDER=s3 with legacy AWS_* aliases', () => {
      const config = validateEnvironment({
        ...baseValidEnv,
        STORAGE_PROVIDER: 's3',
        AWS_ENDPOINT: 'https://aws-r2.cloudflarestorage.com',
        AWS_REGION: 'us-east-1',
        AWS_S3_BUCKET_NAME: 'legacy-bucket',
        AWS_ACCESS_KEY_ID: 'aws-key-id',
        AWS_SECRET_ACCESS_KEY: 'aws-secret-key',
      });

      assert.equal(config.storageProvider, 's3');
      assert.equal(config.s3Endpoint, 'https://aws-r2.cloudflarestorage.com');
      assert.equal(config.s3Region, 'us-east-1');
      assert.equal(config.s3Bucket, 'legacy-bucket');
      assert.equal(config.s3AccessKeyId, 'aws-key-id');
      assert.equal(config.s3SecretAccessKey, 'aws-secret-key');
    });

    it('should reject invalid STORAGE_PROVIDER values', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...baseValidEnv,
            STORAGE_PROVIDER: 'redis',
          }),
        (err) => err.message.includes("STORAGE_PROVIDER must be one of: 'local', 's3'")
      );
    });

    it('should require S3_BUCKET and credentials when STORAGE_PROVIDER=s3', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...baseValidEnv,
            STORAGE_PROVIDER: 's3',
          }),
        (err) =>
          err.message.includes('S3_BUCKET') &&
          err.message.includes('S3_ACCESS_KEY_ID') &&
          err.message.includes('S3_SECRET_ACCESS_KEY')
      );
    });

    it('should reject placeholder S3 credentials in production mode', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...baseValidEnv,
            NODE_ENV: 'production',
            JWT_SECRET: 'a'.repeat(32),
            STORAGE_PROVIDER: 's3',
            S3_BUCKET: 'careerforge-resumes',
            S3_ACCESS_KEY_ID: 'PLACEHOLDER_AWS_ACCESS_KEY_ID',
            S3_SECRET_ACCESS_KEY: 'PLACEHOLDER_AWS_SECRET_ACCESS_KEY',
          }),
        (err) =>
          err.message.includes('S3_BUCKET must not use template placeholder') &&
          err.message.includes('S3_ACCESS_KEY_ID must not use placeholder') &&
          err.message.includes('S3_SECRET_ACCESS_KEY must not use placeholder')
      );
    });
  });

  describe('7. LocalStorageProvider Regression Safety', () => {
    it('should maintain existing LocalStorageProvider operations', async () => {
      const configService = { port: 5000, storageProvider: 'local' };
      const localProvider = new LocalStorageProvider(configService);

      const result = await localProvider.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'local.pdf',
        studentId: 'student-1',
      });

      assert.ok(result.fileKey.endsWith('.pdf'));
      assert.equal(
        result.fileUrl,
        `http://localhost:5000/api/v1/resumes/file/${result.fileKey}`
      );

      const buffer = await localProvider.getBuffer(result.fileKey);
      assert.deepEqual(buffer, samplePdfBuffer);

      await localProvider.delete(result.fileKey);

      await assert.rejects(
        () => localProvider.getBuffer(result.fileKey),
        (err) => err instanceof StorageFileNotFoundError
      );
    });
  });

  describe('8. ResumeService Integration with S3StorageProvider', () => {
    it('should upload and persist resume with S3StorageProvider without modifying domain contracts', async () => {
      let createdData = null;
      let enqueuedData = null;

      const mockPrisma = {
        $transaction: async (cb) => {
          const tx = {
            resume: {
              updateMany: async () => ({ count: 0 }),
              create: async ({ data }) => {
                createdData = data;
                return {
                  id: 'resume-s3-uuid-1',
                  file_key: data.file_key,
                  file_url: data.file_url,
                  is_primary: data.is_primary,
                };
              },
            },
          };
          return cb(tx);
        },
      };

      const mockStudentService = {
        getProfileByUserId: async () => ({ id: 'student-s3-profile-1' }),
      };

      const mockClient = { send: async () => ({}) };
      const configService = createMockConfigService();
      const s3Provider = new S3StorageProvider(configService, mockClient);
      const resumeStorageService = new ResumeStorageService(s3Provider);

      const mockQueueService = {
        send: async (queue, data) => {
          enqueuedData = data;
        },
      };

      const mockApplicationService = { hasRecruiterAccessToResume: async () => true };

      const resumeService = new ResumeService(
        mockPrisma,
        mockStudentService,
        resumeStorageService,
        mockQueueService,
        mockApplicationService
      );

      const uploadResult = await resumeService.uploadResume('user-s3-1', {
        buffer: samplePdfBuffer,
        mimetype: 'application/pdf',
        originalname: 'Applicant_Resume.pdf',
        size: samplePdfBuffer.length,
      });

      assert.equal(uploadResult.id, 'resume-s3-uuid-1');
      assert.equal(uploadResult.is_primary, true);
      assert.ok(createdData);
      assert.ok(/^[0-9a-f-]{36}\.pdf$/i.test(createdData.file_key));
      assert.equal(
        createdData.file_url,
        `https://test-account-id.r2.cloudflarestorage.com/careerforge-test-resumes/${createdData.file_key}`
      );
      assert.equal(enqueuedData.fileKey, createdData.file_key);
    });
  });

  describe('9. ResumeModule DI Provider Selection (STORAGE_PROVIDER_TOKEN Factory)', () => {
    const { ResumeModule } = require('../dist/modules/resume/resume.module');
    const providers = Reflect.getMetadata('providers', ResumeModule) || [];
    const storageProviderRegistration = providers.find(
      (p) => p && typeof p === 'object' && p.provide === STORAGE_PROVIDER_TOKEN
    );

    it('should have registered STORAGE_PROVIDER_TOKEN factory in ResumeModule', () => {
      assert.ok(storageProviderRegistration, 'STORAGE_PROVIDER_TOKEN provider must be registered');
      assert.equal(typeof storageProviderRegistration.useFactory, 'function');
    });

    it('should instantiate LocalStorageProvider when storageProvider is "local"', () => {
      const mockConfig = { storageProvider: 'local', port: 5000 };
      const instance = storageProviderRegistration.useFactory(mockConfig);
      assert.ok(instance instanceof LocalStorageProvider);
    });

    it('should instantiate S3StorageProvider when storageProvider is "s3"', () => {
      const mockConfig = createMockConfigService({ storageProvider: 's3' });
      const instance = storageProviderRegistration.useFactory(mockConfig);
      assert.ok(instance instanceof S3StorageProvider);
    });

    it('should throw deterministic error when storageProvider is invalid', () => {
      const mockConfig = { storageProvider: 'gcs' };
      assert.throws(
        () => storageProviderRegistration.useFactory(mockConfig),
        (err) => err.message.includes('Storage provider "gcs" is not supported. Use "local" or "s3".')
      );
    });
  });
});

