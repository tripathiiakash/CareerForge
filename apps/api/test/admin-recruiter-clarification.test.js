const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { UserRole, VerificationStatus } = require('@prisma/client');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  AdminRecruiterController,
} = require('../dist/modules/admin/admin-recruiter.controller');
const {
  AdminRecruiterService,
} = require('../dist/modules/admin/admin-recruiter.service');

describe('Admin Recruiter Clarification & Verification Review Test Suite', () => {
  const adminUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const recruiterUserId = '11111111-1111-4111-8111-111111111111';
  const recruiterProfileId = '22222222-2222-4222-8222-222222222222';
  const companyId = '33333333-3333-4333-8333-333333333333';
  const verificationId = '44444444-4444-4444-8444-444444444444';

  const validPdfBuffer = Buffer.from('%PDF-1.4 sample verification document');

  // =========================================================================
  // 1. Authorization Guards on AdminRecruiterController
  // =========================================================================
  describe('1. Role & Access Guards on AdminRecruiterController', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminRecruiterController,
    });

    it('requires ADMIN role on AdminRecruiterController', () => {
      const roles = reflector.get(ROLES_KEY, AdminRecruiterController);
      assert.deepEqual(roles, [UserRole.ADMIN]);
    });

    it('permits authenticated ADMIN users', () => {
      const adminUser = { userId: adminUserId, role: UserRole.ADMIN };
      const allowed = guard.canActivate(createMockContext(adminUser));
      assert.equal(allowed, true);
    });

    it('rejects RECRUITER role with 403 Forbidden', () => {
      const recruiterUser = {
        userId: recruiterUserId,
        role: UserRole.RECRUITER,
      };
      assert.throws(
        () => guard.canActivate(createMockContext(recruiterUser)),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('rejects STUDENT role with 403 Forbidden', () => {
      const studentUser = { userId: 'student-id', role: UserRole.STUDENT };
      assert.throws(
        () => guard.canActivate(createMockContext(studentUser)),
        (err) => {
          assert.equal(err.status, 403);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. Pending Recruiter List with Submitted Verification Metadata
  // =========================================================================
  describe('2. AdminRecruiterService - Pending List Metadata', () => {
    it('returns submitted organization details on pending recruiters when available', async () => {
      const mockPrisma = {
        recruiter: {
          findMany: async () => [
            {
              id: recruiterProfileId,
              user_id: recruiterUserId,
              first_name: 'Miles',
              last_name: 'Dyson',
              is_approved: false,
              company: {
                id: companyId,
                name: '',
                website: null,
                logo_url: null,
              },
              user: {
                id: recruiterUserId,
                email: 'miles@cyberdyne.example.com',
                is_banned: false,
                created_at: new Date('2026-10-01'),
              },
              verification: {
                id: verificationId,
                organization_name: 'Cyberdyne Systems Corp',
                website_url: 'https://cyberdyne.example.com',
                linkedin_url: 'https://linkedin.com/company/cyberdyne',
                designation: 'Director of Special Projects',
                description: 'Autonomous robotics research.',
                evidence_file_key: '55555555-5555-4555-8555-555555555555.pdf',
                evidence_original_name: 'Cyberdyne_Articles_Of_Inc.pdf',
                evidence_mime_type: 'application/pdf',
                evidence_size_bytes: 124500,
                status: VerificationStatus.PENDING,
                clarification_message: null,
                clarification_requested_at: null,
                rejection_reason: null,
                reviewed_at: null,
              },
            },
          ],
          count: async () => 1,
        },
      };

      const service = new AdminRecruiterService(mockPrisma, {});
      const result = await service.listPendingRecruiters({
        page: 1,
        limit: 10,
      });

      assert.equal(result.meta.total, 1);
      assert.equal(result.data.length, 1);
      const item = result.data[0];
      assert.equal(item.id, recruiterProfileId);
      assert.equal(
        item.verification.organization_name,
        'Cyberdyne Systems Corp'
      );
      assert.equal(item.verification.status, 'PENDING');
      assert.equal(
        item.verification.evidence_original_name,
        'Cyberdyne_Articles_Of_Inc.pdf'
      );
    });
  });

  // =========================================================================
  // 3. Request Clarification Workflow
  // =========================================================================
  describe('3. AdminRecruiterService - Request Clarification', () => {
    it('sets status to NEEDS_CLARIFICATION and stores admin message and audit metadata', async () => {
      let updatedVerification = null;
      let updatedRecruiter = null;

      const mockPrisma = {
        recruiter: {
          findFirst: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            first_name: 'Sarah',
            last_name: 'Connor',
            is_approved: false,
            company: { id: companyId, name: '' },
            verification: {
              id: verificationId,
              recruiter_id: recruiterProfileId,
              organization_name: 'Cyberdyne',
              status: VerificationStatus.PENDING,
            },
          }),
          update: async ({ data }) => {
            updatedRecruiter = data;
            return {
              id: recruiterProfileId,
              user_id: recruiterUserId,
              first_name: 'Sarah',
              last_name: 'Connor',
              is_approved: data.is_approved,
            };
          },
        },
        recruiterVerification: {
          update: async ({ data }) => {
            updatedVerification = data;
            return { id: verificationId, ...data };
          },
        },
      };

      const service = new AdminRecruiterService(mockPrisma, {});
      const clarificationDto = {
        message:
          'Please upload an official business license or certificate of incorporation.',
      };

      const result = await service.requestClarification(
        recruiterProfileId,
        clarificationDto,
        adminUserId
      );

      assert.equal(result.is_approved, false);
      assert.equal(result.status, 'NEEDS_CLARIFICATION');
      assert.equal(
        updatedVerification.clarification_message,
        'Please upload an official business license or certificate of incorporation.'
      );
      assert.equal(
        updatedVerification.status,
        VerificationStatus.NEEDS_CLARIFICATION
      );
      assert.equal(updatedVerification.reviewed_by_id, adminUserId);
      assert.ok(updatedVerification.clarification_requested_at instanceof Date);
    });
  });

  // =========================================================================
  // 4. Rejection with Reason Workflow
  // =========================================================================
  describe('4. AdminRecruiterService - Rejection with Reason', () => {
    it('sets status to REJECTED and records required rejection reason and audit metadata', async () => {
      let updatedVerification = null;
      let updatedRecruiter = null;

      const mockPrisma = {
        recruiter: {
          findFirst: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            first_name: 'John',
            last_name: 'Doe',
            is_approved: false,
            company: { id: companyId, name: '' },
            verification: {
              id: verificationId,
              recruiter_id: recruiterProfileId,
              organization_name: 'Fake Corp',
              status: VerificationStatus.PENDING,
            },
          }),
          update: async ({ data }) => {
            updatedRecruiter = data;
            return {
              id: recruiterProfileId,
              user_id: recruiterUserId,
              first_name: 'John',
              last_name: 'Doe',
              is_approved: data.is_approved,
            };
          },
        },
        recruiterVerification: {
          update: async ({ data }) => {
            updatedVerification = data;
            return { id: verificationId, ...data };
          },
        },
      };

      const service = new AdminRecruiterService(mockPrisma, {});
      const rejectDto = {
        reason:
          'Organization domain does not match email and cannot be verified via public records.',
      };

      const result = await service.rejectRecruiter(
        recruiterProfileId,
        rejectDto,
        adminUserId
      );

      assert.equal(result.is_approved, false);
      assert.equal(result.status, 'REJECTED');
      assert.equal(
        updatedVerification.rejection_reason,
        'Organization domain does not match email and cannot be verified via public records.'
      );
      assert.equal(updatedVerification.status, VerificationStatus.REJECTED);
      assert.equal(updatedVerification.reviewed_by_id, adminUserId);
      assert.ok(updatedVerification.reviewed_at instanceof Date);
    });
  });

  // =========================================================================
  // 5. Admin Evidence Retrieval & Safe Streaming
  // =========================================================================
  describe('5. AdminRecruiterService & Controller - Evidence Download', () => {
    it('throws NotFoundException when recruiter has no evidence uploaded', async () => {
      const mockPrisma = {
        recruiter: {
          findFirst: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            verification: null,
          }),
        },
      };

      const service = new AdminRecruiterService(mockPrisma, {});
      await assert.rejects(
        () => service.getEvidenceFile(recruiterProfileId),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          return true;
        }
      );
    });

    it('controller serves downloaded evidence with safe attachment headers and nosniff protection', async () => {
      const mockPrisma = {
        recruiter: {
          findFirst: async () => ({
            id: recruiterProfileId,
            user_id: recruiterUserId,
            verification: {
              evidence_file_key: '66666666-6666-4666-8666-666666666666.pdf',
              evidence_original_name: 'Incorporation Document.pdf',
              evidence_mime_type: 'application/pdf',
            },
          }),
        },
      };

      const mockStorage = {
        getBuffer: async () => validPdfBuffer,
      };

      const service = new AdminRecruiterService(mockPrisma, mockStorage);
      const controller = new AdminRecruiterController(service);

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

      await controller.getEvidence(recruiterProfileId, mockRes);

      assert.equal(headers['Content-Type'], 'application/pdf');
      assert.equal(
        headers['Content-Disposition'],
        'attachment; filename="Incorporation_Document.pdf"'
      );
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(headers['X-Frame-Options'], 'DENY');
      assert.equal(headers['Content-Security-Policy'], "default-src 'none'");
      assert.deepEqual(sentBuffer, validPdfBuffer);
    });
  });
});
