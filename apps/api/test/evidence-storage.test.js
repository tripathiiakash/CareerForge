const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs/promises');
const {
  EvidenceStorageService,
} = require('../dist/modules/recruiter/evidence-storage.service');

describe('EvidenceStorageService - Multi-Provider Storage Test Suite', () => {
  const recruiterId = '11111111-1111-4111-8111-111111111111';
  const samplePdfBuffer = Buffer.from('%PDF-1.4 sample verification proof document');

  // =========================================================================
  // 1. Local Storage Provider Tests
  // =========================================================================
  describe('1. Local Filesystem Provider (storageProvider = local)', () => {
    const mockConfigLocal = {
      storageProvider: 'local',
    };

    it('uploads evidence file to local storage and returns valid UUID fileKey', async () => {
      const storage = new EvidenceStorageService(mockConfigLocal);
      const result = await storage.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'tax_return_2025.pdf',
        recruiterId,
      });

      assert.ok(result.fileKey);
      assert.match(
        result.fileKey,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i
      );
      assert.equal(result.sizeBytes, samplePdfBuffer.byteLength);

      // Verify read back
      const readBuffer = await storage.getBuffer(result.fileKey);
      assert.deepEqual(readBuffer, samplePdfBuffer);

      // Clean up
      await storage.delete(result.fileKey);
    });

    it('rejects path traversal attempts on resolveAndVerifyPath', () => {
      const storage = new EvidenceStorageService(mockConfigLocal);

      assert.throws(
        () => storage.resolveAndVerifyPath('../../etc/passwd'),
        /Invalid evidence fileKey format/
      );
      assert.throws(
        () => storage.resolveAndVerifyPath('malicious/sub/path.pdf'),
        /Invalid evidence fileKey format/
      );
      assert.throws(
        () => storage.resolveAndVerifyPath(''),
        /Invalid evidence fileKey format/
      );
    });
  });

  // =========================================================================
  // 2. Cloud S3 Storage Provider Tests
  // =========================================================================
  describe('2. Cloud S3 Storage Provider (storageProvider = s3)', () => {
    const mockConfigS3 = {
      storageProvider: 's3',
      s3Bucket: 'careerforge-test-evidence-bucket',
      s3Region: 'us-east-1',
      s3AccessKeyId: 'test-key',
      s3SecretAccessKey: 'test-secret',
    };

    it('uploads evidence using PutObjectCommand with correct bucket, key prefix, and ContentLength', async () => {
      let sentCommand = null;

      const mockS3Client = {
        send: async (command) => {
          sentCommand = command;
          return {};
        },
      };

      const storage = new EvidenceStorageService(mockConfigS3, mockS3Client);
      const result = await storage.upload({
        buffer: samplePdfBuffer,
        mimeType: 'application/pdf',
        originalName: 'Certificate_Of_Inc.pdf',
        recruiterId,
      });

      assert.ok(result.fileKey);
      assert.match(result.fileKey, /\.pdf$/);
      assert.ok(sentCommand);
      assert.equal(sentCommand.input.Bucket, 'careerforge-test-evidence-bucket');
      assert.equal(
        sentCommand.input.Key,
        `verification-evidence/${result.fileKey}`
      );
      assert.equal(sentCommand.input.ContentLength, samplePdfBuffer.byteLength);
      assert.equal(sentCommand.input.ContentType, 'application/pdf');
      assert.deepEqual(sentCommand.input.Body, samplePdfBuffer);
    });

    it('retrieves evidence buffer using GetObjectCommand', async () => {
      let requestedKey = null;

      const mockS3Client = {
        send: async (command) => {
          requestedKey = command.input.Key;
          return {
            Body: {
              transformToByteArray: async () =>
                new Uint8Array(samplePdfBuffer),
            },
          };
        },
      };

      const storage = new EvidenceStorageService(mockConfigS3, mockS3Client);
      const validKey = '12345678-1234-4234-8234-123456789abc.pdf';
      const retrieved = await storage.getBuffer(validKey);

      assert.equal(
        requestedKey,
        `verification-evidence/${validKey}`
      );
      assert.deepEqual(retrieved, samplePdfBuffer);
    });

    it('deletes evidence object using DeleteObjectCommand', async () => {
      let deletedKey = null;

      const mockS3Client = {
        send: async (command) => {
          deletedKey = command.input.Key;
          return {};
        },
      };

      const storage = new EvidenceStorageService(mockConfigS3, mockS3Client);
      const validKey = '12345678-1234-4234-8234-123456789abc.png';
      await storage.delete(validKey);

      assert.equal(
        deletedKey,
        `verification-evidence/${validKey}`
      );
    });

    it('enforces UUID validation in S3 mode preventing arbitrary key access', async () => {
      const storage = new EvidenceStorageService(mockConfigS3, {});

      await assert.rejects(
        () => storage.getBuffer('../sensitive/credentials.json'),
        /Invalid evidence fileKey format/
      );
      await assert.rejects(
        () => storage.delete('../../public/index.html'),
        /Invalid evidence fileKey format/
      );
    });
  });
});
