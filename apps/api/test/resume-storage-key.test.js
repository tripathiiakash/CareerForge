const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ResumeService } = require('../dist/modules/resume/resume.service');
const {
  ResumeExtractionWorker,
} = require('../dist/modules/resume/workers/resume-extraction.worker');

describe('Phase 6.3-B (ENG-01): Resume Storage-Key Handling Hardening Suite', () => {
  const mockBuffer = Buffer.from('%PDF-1.4 Mock PDF content');

  describe('1. ResumeService - Upload with Canonical file_key Persistence', () => {
    let mockPrisma;
    let mockStudentService;
    let mockStorageService;
    let mockQueueService;

    beforeEach(() => {
      mockStudentService = {
        getProfileByUserId: async () => ({ id: 'student-profile-1' }),
      };
      mockStorageService = {
        uploadFile: async () => ({
          fileKey: 'canonical-storage-uuid-1234.pdf',
          fileUrl: 'https://cdn.example.com/resumes/cdn-path/canonical-storage-uuid-1234.pdf?token=secret123',
        }),
        deleteFile: async () => {},
      };
      mockQueueService = {
        send: async () => {},
      };
    });

    it('should persist uploadResult.fileKey into resume.file_key in the database', async () => {
      let createdResumeData = null;
      let enqueuedJobData = null;

      mockPrisma = {
        $transaction: async (cb) => {
          const tx = {
            resume: {
              updateMany: async () => ({ count: 1 }),
              create: async ({ data, select }) => {
                createdResumeData = data;
                return {
                  id: 'resume-db-uuid-1',
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

      mockQueueService.send = async (queueName, data) => {
        enqueuedJobData = data;
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      const fakeFile = {
        buffer: mockBuffer,
        mimetype: 'application/pdf',
        originalname: 'my-resume.pdf',
        size: mockBuffer.length,
      };

      const result = await service.uploadResume('user-1', fakeFile);

      // Verify explicit file_key was persisted in database record
      assert.ok(createdResumeData);
      assert.equal(
        createdResumeData.file_key,
        'canonical-storage-uuid-1234.pdf',
        'Database create must include explicit file_key'
      );
      assert.equal(
        createdResumeData.file_url,
        'https://cdn.example.com/resumes/cdn-path/canonical-storage-uuid-1234.pdf?token=secret123'
      );

      // Verify queue received the canonical fileKey
      assert.ok(enqueuedJobData);
      assert.equal(enqueuedJobData.fileKey, 'canonical-storage-uuid-1234.pdf');

      // Verify response envelope adheres to docs/API.md §6.1
      assert.equal(result.id, 'resume-db-uuid-1');
      assert.equal(result.is_primary, true);
    });

    it('should rollback storage artifact using fileKey if database transaction fails', async () => {
      let deletedKey = null;
      mockStorageService.deleteFile = async (key) => {
        deletedKey = key;
      };

      mockPrisma = {
        $transaction: async () => {
          throw new Error('DB Connection Failure');
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      const fakeFile = {
        buffer: mockBuffer,
        mimetype: 'application/pdf',
        originalname: 'my-resume.pdf',
        size: mockBuffer.length,
      };

      await assert.rejects(
        () => service.uploadResume('user-1', fakeFile),
        (err) => err.message === 'DB Connection Failure'
      );

      assert.equal(deletedKey, 'canonical-storage-uuid-1234.pdf');
    });
  });

  describe('2. ResumeService - getResumeFile using Canonical file_key without URL reverse-parsing', () => {
    let mockStorageService;

    beforeEach(() => {
      mockStorageService = {
        getFileBuffer: async (key) => Buffer.from(`Content for ${key}`),
      };
    });

    it('should use explicit file_key directly from DB, completely ignoring complex URL structure/query params', async () => {
      let queriedFileKey = null;
      mockStorageService.getFileBuffer = async (key) => {
        queriedFileKey = key;
        return mockBuffer;
      };

      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-1',
            student_id: 'student-profile-1',
            file_key: 'explicit-canonical-key-999.pdf',
            // Notice: file_url has query params, nested paths, and an entirely different ending segment
            file_url: 'https://s3.us-east-1.amazonaws.com/bucket/nested/path/download?signature=xyz&filename=not-the-key.pdf',
            student: {
              user_id: 'student-user-1',
              first_name: 'Jane',
              last_name: 'Doe',
            },
          }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      const result = await service.getResumeFile('student-user-1', 'STUDENT', 'resume-uuid-1');

      // Crucial test for ENG-01: queriedFileKey MUST be the DB file_key, NOT the URL's last segment
      assert.equal(queriedFileKey, 'explicit-canonical-key-999.pdf');
      assert.notEqual(queriedFileKey, 'not-the-key.pdf');
      assert.notEqual(queriedFileKey, 'download');
      assert.ok(result.buffer);
    });

    it('should locate resume by file_key when identifier is a fileKey string', async () => {
      let whereClause = null;
      const mockPrisma = {
        resume: {
          findFirst: async ({ where }) => {
            whereClause = where;
            return {
              id: 'resume-uuid-1',
              student_id: 'student-profile-1',
              file_key: 'lookup-by-key.pdf',
              file_url: 'http://localhost:5000/api/v1/resumes/file/lookup-by-key.pdf',
              student: {
                user_id: 'student-user-1',
                first_name: 'Jane',
                last_name: 'Doe',
              },
            };
          },
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      const result = await service.getResumeFile('student-user-1', 'STUDENT', 'lookup-by-key.pdf');

      assert.ok(whereClause);
      assert.ok(whereClause.OR.some((clause) => clause.file_key === 'lookup-by-key.pdf'));
      assert.equal(result.fileName, 'lookup-by-key.pdf');
    });

    it('should gracefully fallback to extractLegacyFileKey when file_key is null/undefined (backward compatibility)', async () => {
      let queriedFileKey = null;
      mockStorageService.getFileBuffer = async (key) => {
        queriedFileKey = key;
        return mockBuffer;
      };

      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-legacy',
            student_id: 'student-profile-1',
            file_key: null, // Legacy record without explicit file_key
            file_url: 'http://localhost:5000/api/v1/resumes/file/legacy-uuid-8888.pdf',
            student: {
              user_id: 'student-user-1',
              first_name: 'Jane',
              last_name: 'Doe',
            },
          }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      const result = await service.getResumeFile('student-user-1', 'STUDENT', 'resume-uuid-legacy');

      assert.equal(queriedFileKey, 'legacy-uuid-8888.pdf');
      assert.ok(result.buffer);
    });

    it('should throw 404 FILE_NOT_FOUND when both file_key and file_url are missing/empty', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-empty',
            student_id: 'student-profile-1',
            file_key: null,
            file_url: '',
            student: {
              user_id: 'student-user-1',
              first_name: 'Jane',
              last_name: 'Doe',
            },
          }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      await assert.rejects(
        () => service.getResumeFile('student-user-1', 'STUDENT', 'resume-uuid-empty'),
        (err) => err.status === 404 && err.response.code === 'FILE_NOT_FOUND'
      );
    });

    // -----------------------------------------------------------------------
    // Phase 6 Finding-03: Filename Header Sanitization
    // -----------------------------------------------------------------------
    it('Finding-03: should sanitize malicious student names containing quotes, semicolons, CR/LF, and control chars in humanFileName', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: '11111111-2222-3333-4444-555555555555',
            student_id: 'student-profile-1',
            file_key: '11111111-2222-3333-4444-555555555555.pdf',
            file_url: 'http://localhost:5000/api/v1/resumes/file/11111111-2222-3333-4444-555555555555.pdf',
            student: {
              user_id: 'student-user-1',
              first_name: 'John" ;dummy=\r\nInjected-Header: evil\x00\x1f',
              last_name: 'Doe/..\\<script>;foo',
            },
          }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      const result = await service.getResumeFile('student-user-1', 'STUDENT', '11111111-2222-3333-4444-555555555555');

      assert.ok(result.fileName.endsWith('.pdf'), 'Must preserve .pdf extension');
      assert.equal(result.fileName.includes('"'), false, 'Must not contain double quotes');
      assert.equal(result.fileName.includes(';'), false, 'Must not contain semicolons');
      assert.equal(result.fileName.includes('\r'), false, 'Must not contain carriage returns');
      assert.equal(result.fileName.includes('\n'), false, 'Must not contain newlines');
      assert.equal(result.fileName.includes('/'), false, 'Must not contain slashes');
      assert.equal(result.fileName.includes('\\'), false, 'Must not contain backslashes');
      assert.equal(/[\x00-\x1F\x7F]/.test(result.fileName), false, 'Must not contain control characters');

      // Verify simulated Content-Disposition header formatting is safe
      const contentDisposition = `inline; filename="${result.fileName}"`;
      assert.equal(contentDisposition.includes('\r'), false);
      assert.equal(contentDisposition.includes('\n'), false);
      // Ensure quotes are matched pairs only (one at filename=", one at end)
      const quoteCount = (contentDisposition.match(/"/g) || []).length;
      assert.equal(quoteCount, 2, 'Content-Disposition must contain exactly 2 quotes encapsulating filename');
    });

    it('Finding-03: should fallback deterministically to Student_Candidate_Resume.pdf if sanitization empties the names', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: '11111111-2222-3333-4444-555555555555',
            student_id: 'student-profile-1',
            file_key: '11111111-2222-3333-4444-555555555555.pdf',
            file_url: 'http://localhost:5000/api/v1/resumes/file/11111111-2222-3333-4444-555555555555.pdf',
            student: {
              user_id: 'student-user-1',
              first_name: '";\r\n\x00',
              last_name: ';;";/\\',
            },
          }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      const result = await service.getResumeFile('student-user-1', 'STUDENT', '11111111-2222-3333-4444-555555555555');
      assert.equal(result.fileName, 'Student_Candidate_Resume.pdf');
    });

    // -----------------------------------------------------------------------
    // Phase 6 Finding-06: Elimination of Substring Lookup Oracle
    // -----------------------------------------------------------------------
    it('Finding-06: should prevent substring queries from acting as an existence oracle for another student resume', async () => {
      const mockDatabaseResumes = [
        {
          id: '22222222-2222-4222-8222-222222222222',
          student_id: 'student-profile-other',
          file_key: 'other-student-file.pdf',
          file_url: 'http://localhost:5000/api/v1/resumes/file/secret-token-12345.pdf',
          student: {
            user_id: 'other-student-user-id',
            first_name: 'Bob',
            last_name: 'Smith',
          },
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          student_id: 'student-profile-own',
          file_key: 'my-own-file.pdf',
          file_url: 'http://localhost:5000/api/v1/resumes/file/my-own-file.pdf',
          student: {
            user_id: 'attacker-student-user-id',
            first_name: 'Alice',
            last_name: 'Attacker',
          },
        },
      ];

      // Emulate Prisma findFirst logic matching our exact query definition
      const mockPrisma = {
        resume: {
          findFirst: async ({ where }) => {
            if (where.id) {
              return mockDatabaseResumes.find((r) => r.id === where.id) || null;
            }
            if (where.OR) {
              return (
                mockDatabaseResumes.find((r) =>
                  where.OR.some((clause) => {
                    if (clause.file_key && r.file_key === clause.file_key) return true;
                    if (clause.file_url && typeof clause.file_url === 'string' && r.file_url === clause.file_url) return true;
                    if (clause.file_url?.endsWith && r.file_url.endsWith(clause.file_url.endsWith)) return true;
                    return false;
                  })
                ) || null
              );
            }
            return null;
          },
        },
      };

      const service = new ResumeService(
        mockPrisma,
        {},
        mockStorageService,
        {}
      );

      const attackerUserId = 'attacker-student-user-id';

      // 1. Attacker tests substrings of other student's URL: "secret", "token", "12345", "resumes"
      // MUST return 404 NOT_FOUND, NOT 403 FORBIDDEN (cannot act as existence oracle)
      for (const substring of ['secret', 'token', '12345', 'resumes', 'file']) {
        await assert.rejects(
          () => service.getResumeFile(attackerUserId, 'STUDENT', substring),
          (err) => {
            assert.equal(err.status, 404, `Substring "${substring}" must return 404, not reveal existence`);
            assert.equal(err.response.code, 'NOT_FOUND');
            return true;
          }
        );
      }

      // 2. Exact match of other student's full file segment properly enforces authorization (403 FORBIDDEN)
      await assert.rejects(
        () => service.getResumeFile(attackerUserId, 'STUDENT', 'secret-token-12345.pdf'),
        (err) => {
          assert.equal(err.status, 403, 'Exact match of other user file must be 403 Forbidden');
          assert.equal(err.response.code, 'FORBIDDEN');
          return true;
        }
      );

      // 3. Own resume succeeds with 200 OK
      const ownResult = await service.getResumeFile(attackerUserId, 'STUDENT', 'my-own-file.pdf');
      assert.ok(ownResult.buffer);
      assert.equal(ownResult.fileName, 'my-own-file.pdf');

      // 4. Nonexistent identifier returns 404
      await assert.rejects(
        () => service.getResumeFile(attackerUserId, 'STUDENT', 'totally-nonexistent.pdf'),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          return true;
        }
      );
    });
  });

  describe('3. ResumeExtractionWorker - Extraction using Canonical file_key', () => {
    let mockStorageService;
    let mockPdfParserService;
    let mockQueueService;

    beforeEach(() => {
      mockQueueService = { work: async () => {} };
      mockStorageService = {
        getFileBuffer: async (key) => Buffer.from(`PDF for ${key}`),
      };
      mockPdfParserService = {
        extractText: async () => 'Extracted resume skills: React, Node.js, PostgreSQL',
      };
    });

    it('should use explicit fileKey from job.data directly', async () => {
      let requestedKey = null;
      mockStorageService.getFileBuffer = async (key) => {
        requestedKey = key;
        return mockBuffer;
      };

      const mockPrisma = {
        resume: {
          findUnique: async () => ({
            id: 'resume-1',
            student_id: 'student-1',
            file_key: 'db-file-key.pdf',
            file_url: 'http://cdn/other-name.pdf',
            parsed_text: null,
          }),
          update: async () => ({ id: 'resume-1' }),
        },
      };

      const worker = new ResumeExtractionWorker(
        mockQueueService,
        mockPrisma,
        mockStorageService,
        mockPdfParserService
      );

      const job = {
        id: 'job-1',
        name: 'resume-text-extraction',
        data: {
          resumeId: 'resume-1',
          studentId: 'student-1',
          fileKey: 'job-payload-canonical-key.pdf',
        },
      };

      await worker.handleExtractionJob(job);

      assert.equal(requestedKey, 'job-payload-canonical-key.pdf');
    });

    it('should use resume.file_key if job.data.fileKey is not provided', async () => {
      let requestedKey = null;
      mockStorageService.getFileBuffer = async (key) => {
        requestedKey = key;
        return mockBuffer;
      };

      const mockPrisma = {
        resume: {
          findUnique: async () => ({
            id: 'resume-1',
            student_id: 'student-1',
            file_key: 'db-canonical-key.pdf',
            file_url: 'http://cdn/completely-different-url-format.pdf?sig=abc',
            parsed_text: null,
          }),
          update: async () => ({ id: 'resume-1' }),
        },
      };

      const worker = new ResumeExtractionWorker(
        mockQueueService,
        mockPrisma,
        mockStorageService,
        mockPdfParserService
      );

      const job = {
        id: 'job-2',
        name: 'resume-text-extraction',
        data: {
          resumeId: 'resume-1',
          studentId: 'student-1',
          // fileKey omitted from job data
        },
      };

      await worker.handleExtractionJob(job);

      assert.equal(requestedKey, 'db-canonical-key.pdf');
    });

    it('should fallback to legacy file_url parsing only when fileKey and resume.file_key are both missing', async () => {
      let requestedKey = null;
      mockStorageService.getFileBuffer = async (key) => {
        requestedKey = key;
        return mockBuffer;
      };

      const mockPrisma = {
        resume: {
          findUnique: async () => ({
            id: 'resume-legacy',
            student_id: 'student-1',
            file_key: null,
            file_url: 'http://localhost:5000/uploads/resumes/legacy-extracted-key.pdf?v=1',
            parsed_text: null,
          }),
          update: async () => ({ id: 'resume-legacy' }),
        },
      };

      const worker = new ResumeExtractionWorker(
        mockQueueService,
        mockPrisma,
        mockStorageService,
        mockPdfParserService
      );

      const job = {
        id: 'job-3',
        name: 'resume-text-extraction',
        data: {
          resumeId: 'resume-legacy',
          studentId: 'student-1',
        },
      };

      await worker.handleExtractionJob(job);

      assert.equal(requestedKey, 'legacy-extracted-key.pdf');
    });
  });
});
