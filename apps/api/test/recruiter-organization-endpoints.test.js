const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { UserRole, VerificationStatus } = require('@prisma/client');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  RecruiterController,
} = require('../dist/modules/recruiter/recruiter.controller');
const {
  RecruiterService,
} = require('../dist/modules/recruiter/recruiter.service');
const {
  EvidenceStorageService,
} = require('../dist/modules/recruiter/evidence-storage.service');

describe('Recruiter Organization & Evidence Endpoints Test Suite', () => {
  const recruiterUserId = '11111111-1111-4111-8111-111111111111';
  const recruiterProfileId = '22222222-2222-4222-8222-222222222222';
  const companyId = '33333333-3333-4333-8333-333333333333';
  const verificationId = '44444444-4444-4444-8444-444444444444';

  const validPdfBuffer = Buffer.from(
    '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF'
  );

  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);

  // =========================================================================
  // 1. Authorization Guards
  // =========================================================================
  describe('1. Role & Route Guarding on RecruiterController', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => RecruiterController,
    });

    it('requires RECRUITER role on RecruiterController', () => {
      const roles = reflector.get(ROLES_KEY, RecruiterController);
      assert.deepEqual(roles, [UserRole.RECRUITER]);
    });

    it('permits authenticated RECRUITER users', () => {
      const recruiterUser = {
        userId: recruiterUserId,
        role: UserRole.RECRUITER,
      };
      const allowed = guard.canActivate(createMockContext(recruiterUser));
      assert.equal(allowed, true);
    });

    it('rejects STUDENT role with 403 Forbidden', () => {
      const studentUser = { userId: 'student-id', role: UserRole.STUDENT };
      assert.throws(
        () => guard.canActivate(createMockContext(studentUser)),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('rejects unauthenticated requests with 403 Forbidden', () => {
      assert.throws(
        () => guard.canActivate(createMockContext(null)),
        (err) => {
          assert.equal(err.status, 403);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. Organization Details Submission & Lifecycle
  // =========================================================================
  describe('2. RecruiterService - Organization Submission Workflow', () => {
    it('returns null verification when no organization application has been submitted', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            is_approved: false,
            company: {
              id: companyId,
              name: '',
              website: null,
              logo_url: null,
            },
            verification: null,
          }),
        },
      };

      const mockStorage = {};
      const service = new RecruiterService(mockPrisma, mockStorage);
      const result = await service.getOrganizationSubmission(recruiterUserId);

      assert.equal(result.recruiter_id, recruiterProfileId);
      assert.equal(result.is_approved, false);
      assert.equal(result.is_company_assigned, false);
      assert.equal(result.verification, null);
    });

    it('creates a new verification application with PENDING status when none exists', async () => {
      let createdData = null;
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            is_approved: false,
            company: {
              id: companyId,
              name: '',
              website: null,
              logo_url: null,
            },
            verification: createdData,
          }),
        },
        recruiterVerification: {
          create: async ({ data }) => {
            createdData = {
              id: verificationId,
              ...data,
              evidence_file_key: null,
              evidence_original_name: null,
              evidence_mime_type: null,
              evidence_size_bytes: null,
              clarification_message: null,
              clarification_requested_at: null,
              rejection_reason: null,
              reviewed_at: null,
              created_at: new Date(),
              updated_at: new Date(),
            };
            return createdData;
          },
        },
      };

      const mockStorage = {};
      const service = new RecruiterService(mockPrisma, mockStorage);
      const submissionDto = {
        organization_name: 'Stark Enterprises',
        website_url: 'https://stark.example.com',
        linkedin_url: 'https://linkedin.com/company/stark',
        designation: 'VP Talent Acquisition',
        description:
          'Clean energy and advanced aerospace defense technologies.',
      };

      const result = await service.submitOrganization(
        recruiterUserId,
        submissionDto
      );
      assert.equal(createdData.organization_name, 'Stark Enterprises');
      assert.equal(createdData.status, VerificationStatus.PENDING);
      assert.equal(createdData.website_url, 'https://stark.example.com');
      assert.equal(result.verification.organization_name, 'Stark Enterprises');
      assert.equal(result.verification.status, 'PENDING');
    });

    it('resets verification status from NEEDS_CLARIFICATION back to PENDING on resubmission', async () => {
      let updatedData = null;
      const existingVerification = {
        id: verificationId,
        recruiter_id: recruiterProfileId,
        organization_name: 'Wayne Enterprises',
        website_url: 'https://wayne.example.com',
        linkedin_url: null,
        designation: 'Recruiter',
        description: null,
        status: VerificationStatus.NEEDS_CLARIFICATION,
        clarification_message: 'Please provide official legal company name.',
        clarification_requested_at: new Date(),
        evidence_file_key: null,
        evidence_original_name: null,
        evidence_mime_type: null,
        evidence_size_bytes: null,
        rejection_reason: null,
        reviewed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            is_approved: false,
            company: { id: companyId, name: '', website: null, logo_url: null },
            verification: updatedData || existingVerification,
          }),
        },
        recruiterVerification: {
          update: async ({ data }) => {
            updatedData = { ...existingVerification, ...data };
            return updatedData;
          },
        },
      };

      const mockStorage = {};
      const service = new RecruiterService(mockPrisma, mockStorage);
      const resubmissionDto = {
        organization_name: 'Wayne Global Holdings Corp',
        website_url: 'https://waynecorp.example.com',
        linkedin_url: null,
        designation: 'Senior Technical Recruiter',
        description: 'Global infrastructure and tech investment firm.',
      };

      const result = await service.submitOrganization(
        recruiterUserId,
        resubmissionDto
      );
      assert.equal(updatedData.status, VerificationStatus.PENDING);
      assert.equal(updatedData.organization_name, 'Wayne Global Holdings Corp');
      assert.equal(result.verification.status, 'PENDING');
    });

    it('throws NotFoundException if recruiter profile does not exist', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => null,
        },
      };
      const service = new RecruiterService(mockPrisma, {});
      await assert.rejects(
        () => service.getOrganizationSubmission('unknown-uuid'),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 3. Evidence Upload & Security Validations
  // =========================================================================
  describe('3. RecruiterService - Evidence Upload Security', () => {
    it('rejects upload when file is missing', async () => {
      const service = new RecruiterService({}, {});
      await assert.rejects(
        () => service.uploadEvidence(recruiterUserId, null),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          assert.match(err.response.message, /No evidence file provided/i);
          return true;
        }
      );
    });

    it('rejects files exceeding 5MB size limit', async () => {
      const service = new RecruiterService({}, {});
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
      const mockFile = {
        buffer: oversizedBuffer,
        mimetype: 'application/pdf',
        originalname: 'big_evidence.pdf',
      };

      await assert.rejects(
        () => service.uploadEvidence(recruiterUserId, mockFile),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.response.message, /exceeds 5MB limit/i);
          return true;
        }
      );
    });

    it('rejects disallowed MIME types (e.g., text/plain, application/x-msdownload)', async () => {
      const service = new RecruiterService({}, {});
      const mockFile = {
        buffer: Buffer.from('hello plain text'),
        mimetype: 'text/plain',
        originalname: 'notes.txt',
      };

      await assert.rejects(
        () => service.uploadEvidence(recruiterUserId, mockFile),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(err.response.message, /Invalid file type/i);
          return true;
        }
      );
    });

    it('rejects file when magic bytes do not match declared PDF format', async () => {
      const service = new RecruiterService({}, {});
      const fakePdfBuffer = Buffer.from('NOT_A_REAL_PDF_HEADER_JUST_TEXT');
      const mockFile = {
        buffer: fakePdfBuffer,
        mimetype: 'application/pdf',
        originalname: 'fake.pdf',
      };

      await assert.rejects(
        () => service.uploadEvidence(recruiterUserId, mockFile),
        (err) => {
          assert.equal(err.status, 400);
          assert.match(
            err.response.message,
            /contents do not match allowed formats/i
          );
          return true;
        }
      );
    });

    it('successfully uploads valid PDF evidence and records metadata', async () => {
      let storedKey = null;
      const mockStorage = {
        upload: async ({ buffer, mimeType, originalName }) => {
          storedKey = '77777777-7777-4777-8777-777777777777.pdf';
          return {
            fileKey: storedKey,
            originalName,
            mimeType,
            sizeBytes: buffer.byteLength,
          };
        },
        delete: async () => {},
      };

      let savedRecord = null;
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            is_approved: false,
            company: {
              id: companyId,
              name: 'Acme',
              website: null,
              logo_url: null,
            },
            verification: savedRecord,
          }),
        },
        recruiterVerification: {
          create: async ({ data }) => {
            savedRecord = {
              id: verificationId,
              recruiter_id: recruiterProfileId,
              organization_name: data.organization_name,
              evidence_file_key: data.evidence_file_key,
              evidence_original_name: data.evidence_original_name,
              evidence_mime_type: data.evidence_mime_type,
              evidence_size_bytes: data.evidence_size_bytes,
              status: VerificationStatus.PENDING,
              created_at: new Date(),
              updated_at: new Date(),
            };
            return savedRecord;
          },
        },
      };

      const service = new RecruiterService(mockPrisma, mockStorage);
      const mockFile = {
        buffer: validPdfBuffer,
        mimetype: 'application/pdf',
        originalname: 'employment_verification.pdf',
      };

      const result = await service.uploadEvidence(recruiterUserId, mockFile);
      assert.equal(result.verification.evidence_file_key, storedKey);
      assert.equal(
        result.verification.evidence_original_name,
        'employment_verification.pdf'
      );
      assert.equal(result.verification.evidence_mime_type, 'application/pdf');
    });

    it('successfully uploads valid PNG image evidence', async () => {
      const mockStorage = {
        upload: async ({ buffer, mimeType, originalName }) => ({
          fileKey: '88888888-8888-4888-8888-888888888888.png',
          originalName,
          mimeType,
          sizeBytes: buffer.byteLength,
        }),
        delete: async () => {},
      };

      let savedRecord = null;
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            is_approved: false,
            company: {
              id: companyId,
              name: 'Acme',
              website: null,
              logo_url: null,
            },
            verification: savedRecord,
          }),
        },
        recruiterVerification: {
          create: async ({ data }) => {
            savedRecord = {
              id: verificationId,
              recruiter_id: recruiterProfileId,
              ...data,
              created_at: new Date(),
              updated_at: new Date(),
            };
            return savedRecord;
          },
        },
      };

      const service = new RecruiterService(mockPrisma, mockStorage);
      const mockFile = {
        buffer: validPngBuffer,
        mimetype: 'image/png',
        originalname: 'badge_id.png',
      };

      const result = await service.uploadEvidence(recruiterUserId, mockFile);
      assert.equal(result.verification.evidence_mime_type, 'image/png');
      assert.equal(result.verification.evidence_original_name, 'badge_id.png');
    });
  });

  // =========================================================================
  // 4. Evidence Retrieval & Security Headers
  // =========================================================================
  describe('4. RecruiterService & Controller - Evidence Download', () => {
    it('throws NotFoundException when recruiter has no evidence uploaded', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            verification: null,
          }),
        },
      };
      const service = new RecruiterService(mockPrisma, {});
      await assert.rejects(
        () => service.getEvidenceFile(recruiterUserId),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          assert.match(
            err.response.message,
            /No verification evidence uploaded/i
          );
          return true;
        }
      );
    });

    it('controller serves downloaded evidence with safe attachment headers and anti-sniff protections', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            verification: {
              evidence_file_key: '99999999-9999-4999-8999-999999999999.pdf',
              evidence_original_name: 'Letter Of Authorization.pdf',
              evidence_mime_type: 'application/pdf',
            },
          }),
        },
      };

      const mockStorage = {
        getBuffer: async () => validPdfBuffer,
      };

      const service = new RecruiterService(mockPrisma, mockStorage);
      const controller = new RecruiterController(service);

      const headers = {};
      let sentBuffer = null;
      const mockRes = {
        setHeader: (k, v) => {
          headers[k] = v;
        },
        send: (buf) => {
          sentBuffer = buf;
        },
      };

      await controller.getEvidence(recruiterUserId, mockRes);

      assert.equal(headers['Content-Type'], 'application/pdf');
      assert.equal(
        headers['Content-Disposition'],
        'attachment; filename="Letter_Of_Authorization.pdf"'
      );
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(headers['X-Frame-Options'], 'DENY');
      assert.equal(headers['Content-Security-Policy'], "default-src 'none'");
      assert.deepEqual(sentBuffer, validPdfBuffer);
    });
  });

  // =========================================================================
  // 5. Storage Path Traversal Prevention
  // =========================================================================
  describe('5. EvidenceStorageService Path Traversal Protection', () => {
    const storageService = new EvidenceStorageService({ port: 3000 });

    it('rejects path traversal attempts with ../ in fileKey', () => {
      assert.throws(
        () => storageService.resolveAndVerifyPath('../../etc/passwd.pdf'),
        (err) => {
          assert.match(err.message, /Invalid evidence fileKey format/i);
          return true;
        }
      );
    });

    it('rejects keys without valid UUID format', () => {
      assert.throws(
        () => storageService.resolveAndVerifyPath('malicious_file.pdf'),
        (err) => {
          assert.match(err.message, /Invalid evidence fileKey format/i);
          return true;
        }
      );
    });

    it('rejects keys with unsupported file extensions (.exe, .sh, .html)', () => {
      assert.throws(
        () =>
          storageService.resolveAndVerifyPath(
            '11111111-1111-4111-8111-111111111111.exe'
          ),
        (err) => {
          assert.match(err.message, /Invalid evidence fileKey format/i);
          return true;
        }
      );
    });

    it('accepts canonical UUID filename with allowed extension (.pdf)', () => {
      const validKey = '11111111-1111-4111-8111-111111111111.pdf';
      const resolved = storageService.resolveAndVerifyPath(validKey);
      assert.ok(resolved.endsWith(validKey));
    });
  });
});
