const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { JobService } = require('../dist/modules/job/job.service');
const { AdminUserService } = require('../dist/modules/admin/admin-user.service');
const { AdminUserController } = require('../dist/modules/admin/admin-user.controller');
const { ApplicationService } = require('../dist/modules/application/application.service');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { updateUserBanSchema } = require('@careerforge/validation');

describe('Phase 6.3-A: Business Authorization & Abuse-Control Hardening Suite', () => {
  // ==========================================================================
  // BUS-02: Recruiter Approval for Job Creation
  // ==========================================================================
  describe('BUS-02: Recruiter Approval Check (JobService.createJob)', () => {
    const validUserId = '11111111-1111-4111-8111-111111111111';
    const validRecruiterId = '22222222-2222-4222-8222-222222222222';
    const validCompanyId = '33333333-3333-4333-8333-333333333333';
    const validJobId = '44444444-4444-4444-8444-444444444444';

    const validDto = {
      title: 'Senior Distributed Systems Engineer',
      description: 'A comprehensive job description that exceeds the fifty characters minimum requirement for valid postings.',
      required_skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      employment_type: 'FULL_TIME',
    };

    it('should permit job creation when recruiter is_approved is true', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: validRecruiterId,
            user_id: validUserId,
            company_id: validCompanyId,
            is_approved: true,
            company: { id: validCompanyId, name: 'Acme Corp' },
          }),
        },
        job: {
          create: async () => ({ id: validJobId, status: 'PENDING' }),
        },
      };

      const jobService = new JobService(mockPrisma);
      const result = await jobService.createJob(validUserId, validDto);

      assert.equal(result.id, validJobId);
      assert.equal(result.status, 'PENDING');
      assert.match(result.message, /pending admin approval/i);
    });

    it('should reject job creation with 403 FORBIDDEN when recruiter is_approved is false', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: validRecruiterId,
            user_id: validUserId,
            company_id: validCompanyId,
            is_approved: false, // NOT approved
            company: { id: validCompanyId, name: 'Acme Corp' },
          }),
        },
      };

      const jobService = new JobService(mockPrisma);

      await assert.rejects(
        () => jobService.createJob(validUserId, validDto),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          assert.match(err.response.message, /pending admin approval/i);
          return true;
        }
      );
    });

    it('should reject job creation with 404 NOT_FOUND when recruiter profile does not exist', async () => {
      const mockPrisma = {
        recruiter: {
          findUnique: async () => null,
        },
      };

      const jobService = new JobService(mockPrisma);

      await assert.rejects(
        () => jobService.createJob(validUserId, validDto),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('should verify that RolesGuard still blocks students from calling createJob', () => {
      const mockReflector = new Reflector();
      mockReflector.getAllAndOverride = (key) => {
        if (key === 'roles') return ['RECRUITER'];
        return undefined;
      };

      const rolesGuard = new RolesGuard(mockReflector);
      const mockContext = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { userId: 'student-id', email: 'student@test.edu', role: 'STUDENT' },
          }),
        }),
      };

      assert.throws(
        () => rolesGuard.canActivate(mockContext),
        (err) => err.status === 403 && err.response.code === 'FORBIDDEN'
      );
    });
  });

  // ==========================================================================
  // BUS-03: Soft Ban / Unban Workflow
  // ==========================================================================
  describe('BUS-03: Soft Ban / Unban Workflow (AdminUserService & JwtAuthGuard)', () => {
    const adminUserId = 'admin-0000-4000-8000-000000000001';
    const targetStudentId = 'student-0000-4000-8000-000000000002';
    const otherAdminId = 'admin-0000-4000-8000-000000000003';

    it('validation: updateUserBanSchema validates boolean is_banned', () => {
      assert.deepEqual(updateUserBanSchema.parse({ is_banned: true }), { is_banned: true });
      assert.deepEqual(updateUserBanSchema.parse({ is_banned: false }), { is_banned: false });

      assert.throws(() => updateUserBanSchema.parse({ is_banned: 'true' }));
      assert.throws(() => updateUserBanSchema.parse({ is_banned: null }));
      assert.throws(() => updateUserBanSchema.parse({}));
      assert.throws(() => updateUserBanSchema.parse({ is_banned: true, extra: 'bad' }));
    });

    it('admin can soft ban a student user', async () => {
      let updatedPayload = null;
      const mockPrisma = {
        user: {
          findUnique: async ({ where }) => ({
            id: where.id,
            email: 'bad-actor@test.edu',
            role: 'STUDENT',
            is_banned: false,
          }),
          update: async ({ where, data }) => {
            updatedPayload = { where, data };
            return {
              id: where.id,
              email: 'bad-actor@test.edu',
              is_banned: data.is_banned,
            };
          },
        },
      };

      const adminUserService = new AdminUserService(mockPrisma);
      const result = await adminUserService.updateUserBan(targetStudentId, true, adminUserId);

      assert.equal(result.id, targetStudentId);
      assert.equal(result.is_banned, true);
      assert.equal(result.message, 'User has been banned.');
      assert.equal(updatedPayload.data.is_banned, true);
    });

    it('admin can unban a previously banned user', async () => {
      const mockPrisma = {
        user: {
          findUnique: async ({ where }) => ({
            id: where.id,
            email: 'reformed@test.edu',
            role: 'STUDENT',
            is_banned: true,
          }),
          update: async ({ where, data }) => ({
            id: where.id,
            email: 'reformed@test.edu',
            is_banned: data.is_banned,
          }),
        },
      };

      const adminUserService = new AdminUserService(mockPrisma);
      const result = await adminUserService.updateUserBan(targetStudentId, false, adminUserId);

      assert.equal(result.id, targetStudentId);
      assert.equal(result.is_banned, false);
      assert.equal(result.message, 'User has been unbanned.');
    });

    it('admin cannot ban their own account (self-ban protection)', async () => {
      const mockPrisma = { user: {} };
      const adminUserService = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => adminUserService.updateUserBan(adminUserId, true, adminUserId),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          assert.match(err.response.message, /cannot ban their own account/i);
          return true;
        }
      );
    });

    it('admin accounts cannot be banned (protect admin controls)', async () => {
      const mockPrisma = {
        user: {
          findUnique: async () => ({
            id: otherAdminId,
            email: 'admin2@careerforge.dev',
            role: 'ADMIN',
            is_banned: false,
          }),
        },
      };

      const adminUserService = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => adminUserService.updateUserBan(otherAdminId, true, adminUserId),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          assert.match(err.response.message, /admin accounts cannot be banned/i);
          return true;
        }
      );
    });

    it('updateUserBan returns 404 when user does not exist', async () => {
      const mockPrisma = {
        user: {
          findUnique: async () => null,
        },
      };

      const adminUserService = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => adminUserService.updateUserBan('non-existent-id', true, adminUserId),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('JwtAuthGuard rejects active credential if user is banned after token issuance', async () => {
      const mockTokenService = {
        verifyToken: async () => ({
          sub: targetStudentId,
          email: 'banned@test.edu',
          role: 'STUDENT',
        }),
      };
      const mockReflector = new Reflector();
      mockReflector.getAllAndOverride = () => false; // not public

      const mockPrisma = {
        user: {
          findUnique: async ({ where }) => {
            if (where.id === targetStudentId) {
              return { is_banned: true }; // BANNED in database
            }
            return { is_banned: false };
          },
        },
      };

      const guard = new JwtAuthGuard(mockTokenService, mockReflector, { authCookieName: 'cf_auth' }, mockPrisma);
      const mockContext = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => ({
            cookies: { cf_auth: 'valid.active.jwt' },
          }),
        }),
      };

      await assert.rejects(
        () => guard.canActivate(mockContext),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          assert.match(err.response.message, /account has been suspended/i);
          return true;
        }
      );
    });

    it('JwtAuthGuard allows active credential if user is NOT banned', async () => {
      const mockTokenService = {
        verifyToken: async () => ({
          sub: 'active-student-id',
          email: 'active@test.edu',
          role: 'STUDENT',
        }),
      };
      const mockReflector = new Reflector();
      mockReflector.getAllAndOverride = () => false;

      const mockPrisma = {
        user: {
          findUnique: async () => ({ is_banned: false }),
        },
      };

      const guard = new JwtAuthGuard(mockTokenService, mockReflector, { authCookieName: 'cf_auth' }, mockPrisma);
      const req = { cookies: { cf_auth: 'valid.active.jwt' } };
      const mockContext = {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({ getRequest: () => req }),
      };

      const result = await guard.canActivate(mockContext);
      assert.equal(result, true);
      assert.equal(req.user.userId, 'active-student-id');
    });
  });

  // ==========================================================================
  // BUS-01: Global Application Submission Limit
  // ==========================================================================
  describe('BUS-01: Global Application Submission Limit per Student', () => {
    const studentUserId = '11111111-1111-4111-8111-111111111111';
    const studentProfileId = '22222222-2222-4222-8222-222222222222';
    const student2UserId = '55555555-5555-4555-8555-555555555555';
    const student2ProfileId = '66666666-6666-4666-8666-666666666666';
    const validJobId = '33333333-3333-4333-8333-333333333333';
    const validResumeId = '44444444-4444-4444-8444-444444444444';
    const validResume2Id = '77777777-7777-4777-8777-777777777777';

    function buildMockPrisma(applicationCount = 0, existingApp = null) {
      return {
        student: {
          findUnique: async ({ where }) => {
            if (where.user_id === studentUserId) {
              return { id: studentProfileId, user_id: studentUserId };
            }
            if (where.user_id === student2UserId) {
              return { id: student2ProfileId, user_id: student2UserId };
            }
            return null;
          },
        },
        job: {
          findUnique: async () => ({
            id: validJobId,
            status: 'ACTIVE',
          }),
        },
        resume: {
          findUnique: async () => ({
            id: validResumeId,
            student_id: studentProfileId,
          }),
        },
        application: {
          count: async () => applicationCount,
          findUnique: async () => existingApp,
          create: async ({ data }) => ({
            id: 'app-new-1234',
            job_id: data.job_id,
            student_id: data.student_id,
            resume_id: data.resume_id,
            status: 'APPLIED',
            applied_at: new Date(),
          }),
        },
        $transaction: async (fn) => fn({
          $queryRaw: async () => [{ id: studentProfileId }],
          application: {
            count: async () => applicationCount,
            findUnique: async () => existingApp,
            create: async ({ data }) => ({
              id: 'app-new-1234',
              job_id: data.job_id,
              student_id: data.student_id,
              resume_id: data.resume_id,
              status: 'APPLIED',
              applied_at: new Date(),
            }),
          },
        }),
      };
    }

    it('student can apply when current applications count is below limit', async () => {
      const mockPrisma = buildMockPrisma(10); // 10 existing
      const mockConfig = { maxApplicationsPerStudent: 50 };

      const service = new ApplicationService(mockPrisma, undefined, mockConfig);
      const result = await service.applyToJob(studentUserId, validJobId, { resume_id: validResumeId });

      assert.equal(result.application_id, 'app-new-1234');
      assert.equal(result.status, 'APPLIED');
      assert.equal(result.message, 'Successfully applied to the job.');
    });

    it('rejects application with 400 VALIDATION_ERROR when student reaches global limit', async () => {
      const mockPrisma = buildMockPrisma(50); // exactly at limit of 50
      const mockConfig = { maxApplicationsPerStudent: 50 };

      const service = new ApplicationService(mockPrisma, undefined, mockConfig);

      await assert.rejects(
        () => service.applyToJob(studentUserId, validJobId, { resume_id: validResumeId }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          assert.match(err.response.message, /Maximum application limit of 50 reached/i);
          return true;
        }
      );
    });

    it('rejects application when student exceeds global limit', async () => {
      const mockPrisma = buildMockPrisma(101); // 101 applications
      const mockConfig = { maxApplicationsPerStudent: 100 };

      const service = new ApplicationService(mockPrisma, undefined, mockConfig);

      await assert.rejects(
        () => service.applyToJob(studentUserId, validJobId, { resume_id: validResumeId }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          return true;
        }
      );
    });

    it('different students have independent application counts and limits', async () => {
      // Student 1 has 50 applications (maxed), Student 2 has 2 applications
      const mockPrisma = {
        student: {
          findUnique: async ({ where }) => {
            if (where.user_id === studentUserId) return { id: studentProfileId, user_id: studentUserId };
            if (where.user_id === student2UserId) return { id: student2ProfileId, user_id: student2UserId };
            return null;
          },
        },
        job: { findUnique: async () => ({ id: validJobId, status: 'ACTIVE' }) },
        resume: {
          findUnique: async ({ where }) => ({
            id: where.id,
            student_id: where.id === validResumeId ? studentProfileId : student2ProfileId,
          }),
        },
        $transaction: async (fn) => fn({
          $queryRaw: async () => [],
          application: {
            count: async ({ where }) => {
              if (where.student_id === studentProfileId) return 50;
              if (where.student_id === student2ProfileId) return 2;
              return 0;
            },
            findUnique: async () => null,
            create: async ({ data }) => ({
              id: 'app-student-2',
              job_id: data.job_id,
              student_id: data.student_id,
              status: 'APPLIED',
              applied_at: new Date(),
            }),
          },
        }),
      };

      const mockConfig = { maxApplicationsPerStudent: 50 };
      const service = new ApplicationService(mockPrisma, undefined, mockConfig);

      // Student 1 is rejected
      await assert.rejects(
        () => service.applyToJob(studentUserId, validJobId, { resume_id: validResumeId }),
        (err) => err.status === 400 && err.response.code === 'VALIDATION_ERROR'
      );

      // Student 2 succeeds
      const result = await service.applyToJob(student2UserId, validJobId, { resume_id: validResume2Id });
      assert.equal(result.application_id, 'app-student-2');
    });

    it('duplicate application check still takes precedence and returns 409 CONFLICT', async () => {
      const mockPrisma = buildMockPrisma(10, { id: 'existing-app' }); // duplicate exists
      const mockConfig = { maxApplicationsPerStudent: 50 };

      const service = new ApplicationService(mockPrisma, undefined, mockConfig);

      await assert.rejects(
        () => service.applyToJob(studentUserId, validJobId, { resume_id: validResumeId }),
        (err) => err.status === 409 && err.response.code === 'CONFLICT'
      );
    });
  });
});
