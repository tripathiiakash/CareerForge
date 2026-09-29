const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const {
  listPendingRecruitersQuerySchema,
  moderateRecruiterStatusSchema,
} = require('@careerforge/validation');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  AdminRecruiterController,
} = require('../dist/modules/admin/admin-recruiter.controller');
const {
  AdminRecruiterService,
} = require('../dist/modules/admin/admin-recruiter.service');
const { JobService } = require('../dist/modules/job/job.service');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Admin Recruiter Approval Workflow Backend Test Suite', () => {
  const validRecruiterId = '11111111-1111-4111-8111-111111111111';
  const validRecruiterUserId = '22222222-2222-4222-8222-222222222222';
  const otherRecruiterId = '33333333-3333-4333-8333-333333333333';
  const validCompanyId = '44444444-4444-4444-8444-444444444444';
  const validJobId = '55555555-5555-4555-8555-555555555555';

  const validDto = {
    title: 'Software Engineer',
    description:
      'We are looking for a skilled Software Engineer with React and Node.js expertise to join our engineering team.',
    required_skills: ['React', 'Node.js', 'TypeScript'],
    employment_type: 'FULL_TIME',
  };

  // =========================================================================
  // 1. Authorization & Role Guards
  // =========================================================================
  describe('1. Authorization & Role Guards on AdminRecruiterController', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminRecruiterController,
    });

    it('should permit ADMIN role access to AdminRecruiterController', () => {
      const roles = reflector.get(ROLES_KEY, AdminRecruiterController);
      assert.deepEqual(roles, ['ADMIN']);

      const adminUser = { userId: 'admin-uuid', role: 'ADMIN' };
      const allowed = guard.canActivate(createMockContext(adminUser));
      assert.equal(allowed, true);
    });

    it('should reject unauthenticated requests with 403 Forbidden', () => {
      assert.throws(
        () => guard.canActivate(createMockContext(null)),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          assert.match(err.response.message, /Insufficient role permissions/i);
          return true;
        }
      );
    });

    it('should reject STUDENT role with 403 Forbidden', () => {
      const studentUser = { userId: 'student-uuid', role: 'STUDENT' };
      assert.throws(
        () => guard.canActivate(createMockContext(studentUser)),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('should reject RECRUITER role with 403 Forbidden', () => {
      const recruiterUser = { userId: 'recruiter-uuid', role: 'RECRUITER' };
      assert.throws(
        () => guard.canActivate(createMockContext(recruiterUser)),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. Query & Status Validation Schemas
  // =========================================================================
  describe('2. Validation Schemas', () => {
    it('listPendingRecruitersQuerySchema defaults to page=1, limit=10', () => {
      const parsed = listPendingRecruitersQuerySchema.parse({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 10);
    });

    it('listPendingRecruitersQuerySchema accepts valid pagination params', () => {
      const parsed = listPendingRecruitersQuerySchema.parse({
        page: '2',
        limit: '20',
      });
      assert.equal(parsed.page, 2);
      assert.equal(parsed.limit, 20);
    });

    it('listPendingRecruitersQuerySchema rejects limit > 50', () => {
      assert.throws(() =>
        listPendingRecruitersQuerySchema.parse({ limit: 51 })
      );
    });

    it('moderateRecruiterStatusSchema accepts APPROVED and REJECTED status', () => {
      const approved = moderateRecruiterStatusSchema.parse({
        status: 'APPROVED',
      });
      assert.equal(approved.status, 'APPROVED');

      const rejected = moderateRecruiterStatusSchema.parse({
        status: 'REJECTED',
      });
      assert.equal(rejected.status, 'REJECTED');

      const boolApproved = moderateRecruiterStatusSchema.parse({
        is_approved: true,
      });
      assert.equal(boolApproved.is_approved, true);
    });
  });

  // =========================================================================
  // 3. AdminRecruiterService Operations
  // =========================================================================
  describe('3. AdminRecruiterService Implementation', () => {
    it('admin can list pending recruiters with full company & user information', async () => {
      const mockPrisma = {
        recruiter: {
          findMany: async ({ where, skip, take }) => {
            assert.equal(where.is_approved, false);
            assert.equal(skip, 0);
            assert.equal(take, 10);
            return [
              {
                id: validRecruiterId,
                user_id: validRecruiterUserId,
                first_name: 'Jane',
                last_name: 'Doe',
                is_approved: false,
                company: {
                  id: validCompanyId,
                  name: 'TechCorp Innovations',
                  website: 'https://techcorp.example.com',
                  logo_url: 'https://techcorp.example.com/logo.png',
                },
                user: {
                  id: validRecruiterUserId,
                  email: 'jane@techcorp.example.com',
                  is_banned: false,
                  created_at: new Date('2026-09-20T10:00:00Z'),
                },
              },
            ];
          },
          count: async ({ where }) => {
            assert.equal(where.is_approved, false);
            return 1;
          },
        },
      };

      const service = new AdminRecruiterService(mockPrisma);
      const result = await service.listPendingRecruiters({
        page: 1,
        limit: 10,
      });

      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].id, validRecruiterId);
      assert.equal(result.data[0].email, 'jane@techcorp.example.com');
      assert.equal(result.data[0].company.name, 'TechCorp Innovations');
      assert.equal(result.data[0].is_approved, false);
      assert.equal(result.meta.total, 1);
      assert.equal(result.meta.page, 1);
      assert.equal(result.meta.totalPages, 1);
    });

    it('admin can approve recruiter and only updates the intended recruiter record', async () => {
      let updatedWhere = null;
      let updatedData = null;

      const mockPrisma = {
        recruiter: {
          findFirst: async ({ where }) => {
            if (
              where.OR.some(
                (cond) =>
                  cond.id === validRecruiterId ||
                  cond.user_id === validRecruiterId
              )
            ) {
              return {
                id: validRecruiterId,
                user_id: validRecruiterUserId,
                first_name: 'Jane',
                last_name: 'Doe',
                is_approved: false,
              };
            }
            return null;
          },
          update: async ({ where, data }) => {
            updatedWhere = where;
            updatedData = data;
            return {
              id: where.id,
              user_id: validRecruiterUserId,
              first_name: 'Jane',
              last_name: 'Doe',
              is_approved: data.is_approved,
            };
          },
        },
      };

      const service = new AdminRecruiterService(mockPrisma);
      const result = await service.approveRecruiter(validRecruiterId);

      assert.equal(result.id, validRecruiterId);
      assert.equal(result.is_approved, true);
      assert.match(result.message, /approved successfully/i);

      // Verify targeted record update
      assert.deepEqual(updatedWhere, { id: validRecruiterId });
      assert.deepEqual(updatedData, { is_approved: true });
    });

    it('admin can reject/disable a recruiter', async () => {
      let updatedWhere = null;
      let updatedData = null;

      const mockPrisma = {
        recruiter: {
          findFirst: async () => ({
            id: validRecruiterId,
            user_id: validRecruiterUserId,
            first_name: 'Jane',
            last_name: 'Doe',
            is_approved: true,
          }),
          update: async ({ where, data }) => {
            updatedWhere = where;
            updatedData = data;
            return {
              id: where.id,
              user_id: validRecruiterUserId,
              first_name: 'Jane',
              last_name: 'Doe',
              is_approved: data.is_approved,
            };
          },
        },
      };

      const service = new AdminRecruiterService(mockPrisma);
      const result = await service.rejectRecruiter(validRecruiterId);

      assert.equal(result.id, validRecruiterId);
      assert.equal(result.is_approved, false);
      assert.match(result.message, /rejected/i);
      assert.deepEqual(updatedWhere, { id: validRecruiterId });
      assert.deepEqual(updatedData, { is_approved: false });
    });

    it('throws NotFoundException when recruiter profile does not exist', async () => {
      const mockPrisma = {
        recruiter: {
          findFirst: async () => null,
        },
      };

      const service = new AdminRecruiterService(mockPrisma);
      await assert.rejects(
        () => service.approveRecruiter('non-existent-id'),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.response.code, 'NOT_FOUND');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. Recruiter Job Posting Lifecycle with is_approved
  // =========================================================================
  describe('4. Recruiter Job Posting Lifecycle & is_approved Gate', () => {
    it('unapproved recruiter gets 403 FORBIDDEN when attempting to post a job', async () => {
      const mockRecruiterService = {
        getProfileByUserId: async (userId) => ({
          id: validRecruiterId,
          user_id: userId,
          first_name: 'Jane',
          last_name: 'Doe',
          is_approved: false, // NOT approved
          company: {
            id: validCompanyId,
            name: 'TechCorp',
          },
        }),
      };

      const mockPrisma = {
        job: {
          create: async () => assert.fail('Should not be called'),
        },
      };

      const jobService = new JobService(mockPrisma, mockRecruiterService, {});

      await assert.rejects(
        () => jobService.createJob(validRecruiterUserId, validDto),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          assert.match(err.response.message, /pending admin approval/i);
          return true;
        }
      );
    });

    it('recruiter can post job after approval (is_approved === true)', async () => {
      const mockRecruiterService = {
        getProfileByUserId: async (userId) => ({
          id: validRecruiterId,
          user_id: userId,
          first_name: 'Jane',
          last_name: 'Doe',
          is_approved: true, // APPROVED
          company: {
            id: validCompanyId,
            name: 'TechCorp',
          },
        }),
      };

      const mockPrisma = {
        job: {
          create: async ({ data }) => {
            assert.equal(data.recruiter_id, validRecruiterId);
            assert.equal(data.company_id, validCompanyId);
            return {
              id: validJobId,
              status: 'PENDING',
              title: data.title,
            };
          },
        },
      };

      const jobService = new JobService(mockPrisma, mockRecruiterService, {});
      const result = await jobService.createJob(validRecruiterUserId, validDto);

      assert.equal(result.id, validJobId);
      assert.equal(result.status, 'PENDING');
      assert.match(result.message, /pending admin approval/i);
    });
  });
});
