const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { listPendingJobsQuerySchema } = require('@careerforge/validation');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { AdminJobController } = require('../dist/modules/job/admin-job.controller');
const { JobService } = require('../dist/modules/job/job.service');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Phase 5.13.0 — Admin Pending Jobs Backend Contract Test Suite', () => {
  // =========================================================================
  // 1. Authorization & Role Guards (docs/API.md §9.1)
  // =========================================================================
  describe('Authorization & Guard Checks', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminJobController,
    });

    it('1. ADMIN role can access the endpoint', () => {
      const roles = reflector.get(ROLES_KEY, AdminJobController);
      assert.deepEqual(roles, ['ADMIN']);

      const adminUser = { userId: 'admin-1', role: 'ADMIN' };
      const allowed = guard.canActivate(createMockContext(adminUser));
      assert.equal(allowed, true);
    });

    it('2. Unauthenticated request is rejected', () => {
      assert.throws(
        () => guard.canActivate(createMockContext(null)),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('3. STUDENT role is rejected with 403 Forbidden', () => {
      const studentUser = { userId: 'student-1', role: 'STUDENT' };
      assert.throws(
        () => guard.canActivate(createMockContext(studentUser)),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('4. RECRUITER role is rejected with 403 Forbidden', () => {
      const recruiterUser = { userId: 'recruiter-1', role: 'RECRUITER' };
      assert.throws(
        () => guard.canActivate(createMockContext(recruiterUser)),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });
  });

  // =========================================================================
  // 2. Query Validation Schema (packages/validation)
  // =========================================================================
  describe('Query Validation (listPendingJobsQuerySchema)', () => {
    it('10. Default pagination is page=1, limit=10', () => {
      const parsed = listPendingJobsQuerySchema.parse({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 10);
    });

    it('11. Custom pagination parameters are accepted and coerced to integers', () => {
      const parsed = listPendingJobsQuerySchema.parse({
        page: '3',
        limit: '25',
      });
      assert.equal(parsed.page, 3);
      assert.equal(parsed.limit, 25);
    });

    it('12. limit > 50 is rejected', () => {
      assert.throws(
        () => listPendingJobsQuerySchema.parse({ limit: 51 }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes('cannot exceed 50'))
      );
    });

    it('13. page < 1 is rejected', () => {
      assert.throws(
        () => listPendingJobsQuerySchema.parse({ page: 0 }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes('at least 1'))
      );

      assert.throws(
        () => listPendingJobsQuerySchema.parse({ page: -5 }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes('at least 1'))
      );
    });

    it('14. Unexpected query parameters are rejected (.strict())', () => {
      assert.throws(
        () =>
          listPendingJobsQuerySchema.parse({
            page: 1,
            limit: 10,
            status: 'PENDING', // unknown property
          }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.code === 'unrecognized_keys')
      );

      assert.throws(
        () =>
          listPendingJobsQuerySchema.parse({
            malicious: 'drop table jobs',
          }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.code === 'unrecognized_keys')
      );
    });
  });

  // =========================================================================
  // 3. Service Layer Business Logic (JobService.listPendingJobs)
  // =========================================================================
  describe('JobService.listPendingJobs', () => {
    let service;
    let mockPrisma;
    let capturedFindManyArgs;
    let capturedCountArgs;

    const mockPendingJobsFromDb = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Junior Backend Developer',
        description: 'We are looking for a Node.js developer...',
        required_skills: ['Node.js', 'PostgreSQL'],
        employment_type: 'FULL_TIME',
        created_at: new Date('2026-09-10T12:00:00.000Z'),
        recruiter: {
          first_name: 'Sarah',
          last_name: 'Connor',
          user: {
            email: 'sarah@technova.example.com',
          },
        },
        company: {
          name: 'TechNova Solutions',
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Frontend Intern',
        description: 'React developer internship opportunity...',
        required_skills: ['React', 'TypeScript'],
        employment_type: 'INTERNSHIP',
        created_at: new Date('2026-09-09T10:00:00.000Z'),
        recruiter: {
          first_name: 'Alex',
          last_name: 'Murphy',
          user: {
            email: 'alex@omnicorp.example.com',
          },
        },
        company: {
          name: 'OmniCorp Dynamics',
        },
      },
    ];

    beforeEach(() => {
      capturedFindManyArgs = null;
      capturedCountArgs = null;

      mockPrisma = {
        job: {
          findMany: async (args) => {
            capturedFindManyArgs = args;
            return mockPendingJobsFromDb;
          },
          count: async (args) => {
            capturedCountArgs = args;
            return mockPendingJobsFromDb.length;
          },
        },
      };

      service = new JobService(mockPrisma, {}, {});
    });

    it('5. Only PENDING jobs are queried from the database', async () => {
      await service.listPendingJobs({ page: 1, limit: 10 });
      assert.deepEqual(capturedFindManyArgs.where, { status: 'PENDING' });
      assert.deepEqual(capturedCountArgs.where, { status: 'PENDING' });
    });

    it('6 & 7. ACTIVE and REJECTED jobs are excluded by the where clause', async () => {
      // Confirmed: the query filter enforces where: { status: 'PENDING' } exclusively
      await service.listPendingJobs({ page: 1, limit: 10 });
      assert.equal(capturedFindManyArgs.where.status, 'PENDING');
      assert.equal(capturedFindManyArgs.where.status !== 'ACTIVE', true);
      assert.equal(capturedFindManyArgs.where.status !== 'REJECTED', true);
    });

    it('8. Jobs belonging to multiple recruiters are represented if PENDING', async () => {
      const result = await service.listPendingJobs({ page: 1, limit: 10 });
      assert.equal(result.data.length, 2);
      assert.equal(result.data[0].recruiter.email, 'sarah@technova.example.com');
      assert.equal(result.data[1].recruiter.email, 'alex@omnicorp.example.com');
      assert.equal(result.data[0].company.name, 'TechNova Solutions');
      assert.equal(result.data[1].company.name, 'OmniCorp Dynamics');
    });

    it('9. Ordering is created_at DESC', async () => {
      await service.listPendingJobs({ page: 1, limit: 10 });
      assert.deepEqual(capturedFindManyArgs.orderBy, { created_at: 'desc' });
    });

    it('10. Default pagination (page 1, limit 10) sets skip=0 and take=10', async () => {
      await service.listPendingJobs({});
      assert.equal(capturedFindManyArgs.skip, 0);
      assert.equal(capturedFindManyArgs.take, 10);
    });

    it('11. Custom pagination calculates skip and take properly', async () => {
      await service.listPendingJobs({ page: 3, limit: 15 });
      assert.equal(capturedFindManyArgs.skip, 30);
      assert.equal(capturedFindManyArgs.take, 15);
    });

    it('15. total count reflects the database total', async () => {
      mockPrisma.job.count = async () => 42;
      const result = await service.listPendingJobs({ page: 1, limit: 10 });
      assert.equal(result.meta.total, 42);
    });

    it('16. totalPages is calculated accurately', async () => {
      mockPrisma.job.count = async () => 25;
      const result = await service.listPendingJobs({ page: 1, limit: 10 });
      assert.equal(result.meta.totalPages, 3);

      mockPrisma.job.count = async () => 0;
      const emptyResult = await service.listPendingJobs({ page: 1, limit: 10 });
      assert.equal(emptyResult.meta.totalPages, 0);

      mockPrisma.job.count = async () => 20;
      const exactResult = await service.listPendingJobs({ page: 1, limit: 10 });
      assert.equal(exactResult.meta.totalPages, 2);
    });

    it('17. Empty result returns data=[] with accurate metadata', async () => {
      mockPrisma.job.findMany = async () => [];
      mockPrisma.job.count = async () => 0;

      const result = await service.listPendingJobs({ page: 1, limit: 10 });
      assert.deepEqual(result.data, []);
      assert.deepEqual(result.meta, {
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
    });

    it('18. Internal fields (password_hash, recruiter_id, company_id, audit) are not exposed', async () => {
      const result = await service.listPendingJobs({ page: 1, limit: 10 });
      const firstItem = result.data[0];

      // Check exposed fields
      assert.equal(firstItem.id, '11111111-1111-4111-8111-111111111111');
      assert.equal(firstItem.title, 'Junior Backend Developer');
      assert.equal(firstItem.description, 'We are looking for a Node.js developer...');
      assert.deepEqual(firstItem.required_skills, ['Node.js', 'PostgreSQL']);
      assert.equal(firstItem.employment_type, 'FULL_TIME');
      assert.deepEqual(firstItem.recruiter, {
        first_name: 'Sarah',
        last_name: 'Connor',
        email: 'sarah@technova.example.com',
      });
      assert.deepEqual(firstItem.company, {
        name: 'TechNova Solutions',
      });
      assert.ok(firstItem.created_at);

      // Verify unexposed private/internal fields
      assert.equal(firstItem.recruiter_id, undefined);
      assert.equal(firstItem.company_id, undefined);
      assert.equal(firstItem.updated_at, undefined);
      assert.equal(firstItem.recruiter.user_id, undefined);
      assert.equal(firstItem.recruiter.password, undefined);
      assert.equal(firstItem.recruiter.password_hash, undefined);
    });
  });

  // =========================================================================
  // 4. Controller Layer Delegation & Envelope (AdminJobController)
  // =========================================================================
  describe('AdminJobController.listPendingJobs', () => {
    it('19. Controller returns documented { success: true, data, meta } response envelope', async () => {
      const mockResult = {
        data: [
          {
            id: 'job-1',
            title: 'Test Job',
            description: 'Description',
            required_skills: ['Go'],
            employment_type: 'FULL_TIME',
            recruiter: {
              first_name: 'Jane',
              last_name: 'Doe',
              email: 'jane@example.com',
            },
            company: {
              name: 'Example Inc',
            },
            created_at: new Date(),
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
      };

      let passedQuery = null;
      const mockService = {
        listPendingJobs: async (query) => {
          passedQuery = query;
          return mockResult;
        },
      };

      const controller = new AdminJobController(mockService);
      const response = await controller.listPendingJobs({ page: 1, limit: 10 });

      assert.deepEqual(passedQuery, { page: 1, limit: 10 });
      assert.equal(response.success, true);
      assert.deepEqual(response.data, mockResult.data);
      assert.deepEqual(response.meta, mockResult.meta);
    });

    it('20. Existing PATCH moderation behavior is completely unchanged', async () => {
      const mockModerationResult = {
        id: 'job-moderated-1',
        status: 'ACTIVE',
        message: 'Job approved and now visible to students.',
      };

      let capturedId = null;
      let capturedDto = null;
      const mockService = {
        moderateJobStatus: async (id, dto) => {
          capturedId = id;
          capturedDto = dto;
          return mockModerationResult;
        },
      };

      const controller = new AdminJobController(mockService);
      const patchResponse = await controller.moderateJobStatus('job-moderated-1', {
        status: 'ACTIVE',
      });

      assert.equal(capturedId, 'job-moderated-1');
      assert.deepEqual(capturedDto, { status: 'ACTIVE' });
      assert.deepEqual(patchResponse, {
        success: true,
        data: mockModerationResult,
      });
    });
  });
});
