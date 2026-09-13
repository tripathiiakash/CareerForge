const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { listUsersQuerySchema } = require('@careerforge/validation');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { AdminUserController } = require('../dist/modules/admin/admin-user.controller');
const { AdminUserService } = require('../dist/modules/admin/admin-user.service');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Phase 5.14.0 — Admin User Management Backend Contract Test Suite', () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const targetStudentUserId = '22222222-2222-4222-8222-222222222222';
  const targetRecruiterUserId = '33333333-3333-4333-8333-333333333333';
  const targetAdminUserId = '44444444-4444-4444-8444-444444444444';

  // =========================================================================
  // 1. Authorization & Role Guards (docs/API.md §9.3 & §9.4)
  // =========================================================================
  describe('1. Authorization & Guard Checks', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminUserController,
    });

    it('1. ADMIN role can access the controller', () => {
      const roles = reflector.get(ROLES_KEY, AdminUserController);
      assert.deepEqual(roles, ['ADMIN']);

      const adminUser = { userId: adminId, role: 'ADMIN' };
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
      const studentUser = { userId: targetStudentUserId, role: 'STUDENT' };
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
      const recruiterUser = { userId: targetRecruiterUserId, role: 'RECRUITER' };
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
  // 2. Query Validation Schema (packages/validation: listUsersQuerySchema)
  // =========================================================================
  describe('2. Query Validation (listUsersQuerySchema)', () => {
    it('5. Default pagination is page=1, limit=20', () => {
      const parsed = listUsersQuerySchema.parse({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 20);
    });

    it('6. Custom pagination parameters are accepted and coerced to integers', () => {
      const parsed = listUsersQuerySchema.parse({
        page: '4',
        limit: '15',
      });
      assert.equal(parsed.page, 4);
      assert.equal(parsed.limit, 15);
    });

    it('7. limit > 50 is rejected', () => {
      assert.throws(
        () => listUsersQuerySchema.parse({ limit: 51 }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes('cannot exceed 50'))
      );
    });

    it('8. page < 1 is rejected', () => {
      assert.throws(
        () => listUsersQuerySchema.parse({ page: 0 }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes('at least 1'))
      );

      assert.throws(
        () => listUsersQuerySchema.parse({ page: -3 }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes('at least 1'))
      );
    });

    it('9. role filtering accepts STUDENT and RECRUITER, rejects invalid values', () => {
      const studentParsed = listUsersQuerySchema.parse({ role: 'STUDENT' });
      assert.equal(studentParsed.role, 'STUDENT');

      const recruiterParsed = listUsersQuerySchema.parse({ role: 'RECRUITER' });
      assert.equal(recruiterParsed.role, 'RECRUITER');

      assert.throws(
        () => listUsersQuerySchema.parse({ role: 'ADMIN' }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.message.includes("Role must be exactly 'STUDENT' or 'RECRUITER'"))
      );

      assert.throws(
        () => listUsersQuerySchema.parse({ role: 'SUPERUSER' }),
        (err) => err.name === 'ZodError'
      );
    });

    it('10. search parameter is trimmed', () => {
      const parsed = listUsersQuerySchema.parse({ search: '  test@example.com  ' });
      assert.equal(parsed.search, 'test@example.com');
    });

    it('11. unexpected query parameters are rejected (.strict())', () => {
      assert.throws(
        () =>
          listUsersQuerySchema.parse({
            page: 1,
            limit: 20,
            sort: 'name',
          }),
        (err) =>
          err.name === 'ZodError' &&
          err.issues.some((i) => i.code === 'unrecognized_keys')
      );
    });
  });

  // =========================================================================
  // 3. User Listing Service Layer (AdminUserService.listUsers)
  // =========================================================================
  describe('3. AdminUserService.listUsers', () => {
    let service;
    let mockPrisma;
    let capturedFindManyArgs;
    let capturedCountArgs;

    const mockDbUsers = [
      {
        id: targetStudentUserId,
        email: 'alice.student@university.edu',
        role: 'STUDENT',
        is_banned: false,
        created_at: new Date('2026-01-15T08:00:00.000Z'),
        student: {
          first_name: 'Alice',
          last_name: 'Smith',
        },
        recruiter: null,
      },
      {
        id: targetRecruiterUserId,
        email: 'bob.recruiter@techcorp.com',
        role: 'RECRUITER',
        is_banned: false,
        created_at: new Date('2026-01-14T09:00:00.000Z'),
        student: null,
        recruiter: {
          first_name: 'Bob',
          last_name: 'Jones',
          company: {
            name: 'TechCorp Solutions',
          },
        },
      },
      {
        id: targetAdminUserId,
        email: 'carol.admin@careerforge.internal',
        role: 'ADMIN',
        is_banned: false,
        created_at: new Date('2026-01-10T10:00:00.000Z'),
        student: null,
        recruiter: null,
      },
    ];

    beforeEach(() => {
      capturedFindManyArgs = null;
      capturedCountArgs = null;

      mockPrisma = {
        user: {
          findMany: async (args) => {
            capturedFindManyArgs = args;
            return mockDbUsers;
          },
          count: async (args) => {
            capturedCountArgs = args;
            return mockDbUsers.length;
          },
        },
      };

      service = new AdminUserService(mockPrisma);
    });

    it('12. pagination sets skip and take properly', async () => {
      await service.listUsers({ page: 2, limit: 15 });
      assert.equal(capturedFindManyArgs.skip, 15);
      assert.equal(capturedFindManyArgs.take, 15);
    });

    it('13. default pagination sets skip=0, take=20', async () => {
      await service.listUsers({});
      assert.equal(capturedFindManyArgs.skip, 0);
      assert.equal(capturedFindManyArgs.take, 20);
    });

    it('14. role filter is correctly applied to where clause', async () => {
      await service.listUsers({ role: 'STUDENT' });
      assert.equal(capturedFindManyArgs.where.role, 'STUDENT');
      assert.equal(capturedCountArgs.where.role, 'STUDENT');
    });

    it('15. email search performs case-insensitive substring search', async () => {
      await service.listUsers({ search: '  techcorp  ' });
      assert.deepEqual(capturedFindManyArgs.where.email, {
        contains: 'techcorp',
        mode: 'insensitive',
      });
      assert.deepEqual(capturedCountArgs.where.email, {
        contains: 'techcorp',
        mode: 'insensitive',
      });
    });

    it('16. ordering is deterministic (created_at DESC, id ASC)', async () => {
      await service.listUsers({});
      assert.deepEqual(capturedFindManyArgs.orderBy, [
        { created_at: 'desc' },
        { id: 'asc' },
      ]);
    });

    it('17. password_hash is NEVER selected or exposed', async () => {
      await service.listUsers({});
      assert.equal(capturedFindManyArgs.select.password_hash, undefined);

      const result = await service.listUsers({});
      for (const item of result.data) {
        assert.equal(item.password_hash, undefined);
        assert.equal(item.password, undefined);
      }
    });

    it('18. profile projection correctly maps student vs recruiter', async () => {
      const result = await service.listUsers({});
      assert.equal(result.data.length, 3);

      // Student user
      const studentUser = result.data[0];
      assert.equal(studentUser.role, 'STUDENT');
      assert.deepEqual(studentUser.student, {
        first_name: 'Alice',
        last_name: 'Smith',
      });
      assert.equal(studentUser.recruiter, null);

      // Recruiter user
      const recruiterUser = result.data[1];
      assert.equal(recruiterUser.role, 'RECRUITER');
      assert.equal(recruiterUser.student, null);
      assert.deepEqual(recruiterUser.recruiter, {
        first_name: 'Bob',
        last_name: 'Jones',
        company: {
          name: 'TechCorp Solutions',
        },
      });

      // Admin user
      const adminUserItem = result.data[2];
      assert.equal(adminUserItem.role, 'ADMIN');
      assert.equal(adminUserItem.student, null);
      assert.equal(adminUserItem.recruiter, null);
    });

    it('19. totalPages is calculated accurately, handling 0 items', async () => {
      mockPrisma.user.count = async () => 0;
      mockPrisma.user.findMany = async () => [];
      const emptyResult = await service.listUsers({ page: 1, limit: 20 });
      assert.equal(emptyResult.meta.total, 0);
      assert.equal(emptyResult.meta.totalPages, 0);

      mockPrisma.user.count = async () => 45;
      const paginatedResult = await service.listUsers({ page: 1, limit: 20 });
      assert.equal(paginatedResult.meta.total, 45);
      assert.equal(paginatedResult.meta.totalPages, 3);
    });
  });

  // =========================================================================
  // 4. Transactional User Deletion (AdminUserService.deleteUser)
  // =========================================================================
  describe('4. AdminUserService.deleteUser & Cascade Sequences', () => {
    let service;
    let mockPrisma;
    let executedTxCalls;

    beforeEach(() => {
      executedTxCalls = [];
    });

    it('20. self-deletion is rejected before transaction execution', async () => {
      mockPrisma = {
        user: { findUnique: async () => ({ id: adminId }) },
        $transaction: async () => {},
      };
      service = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => service.deleteUser(adminId, adminId),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Admins cannot delete their own account'
      );
    });

    it('21. deleting non-existent user returns 404 NotFoundException', async () => {
      mockPrisma = {
        user: { findUnique: async () => null },
      };
      service = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => service.deleteUser('99999999-9999-4999-8999-999999999999', adminId),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'User does not exist'
      );
    });

    it('22. STUDENT deletion removes all dependents in safe topological order', async () => {
      const studentId = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
      const resumeId1 = 'rrrrrrrr-1111-4111-8111-rrrrrrrrrrrr';
      const resumeId2 = 'rrrrrrrr-2222-4222-8222-rrrrrrrrrrrr';

      mockPrisma = {
        user: {
          findUnique: async () => ({
            id: targetStudentUserId,
            role: 'STUDENT',
            student: { id: studentId },
            recruiter: null,
          }),
        },
        $transaction: async (fn) => {
          const mockTx = {
            application: {
              deleteMany: async (args) => {
                executedTxCalls.push({ entity: 'application', action: 'deleteMany', args });
                return { count: 2 };
              },
            },
            resume: {
              findMany: async (args) => {
                executedTxCalls.push({ entity: 'resume', action: 'findMany', args });
                return [{ id: resumeId1 }, { id: resumeId2 }];
              },
              deleteMany: async (args) => {
                executedTxCalls.push({ entity: 'resume', action: 'deleteMany', args });
                return { count: 2 };
              },
            },
            aiAnalysis: {
              deleteMany: async (args) => {
                executedTxCalls.push({ entity: 'aiAnalysis', action: 'deleteMany', args });
                return { count: 2 };
              },
            },
            student: {
              delete: async (args) => {
                executedTxCalls.push({ entity: 'student', action: 'delete', args });
                return { id: studentId };
              },
            },
            user: {
              delete: async (args) => {
                executedTxCalls.push({ entity: 'user', action: 'delete', args });
                return { id: targetStudentUserId };
              },
            },
          };
          return await fn(mockTx);
        },
      };

      service = new AdminUserService(mockPrisma);
      const result = await service.deleteUser(targetStudentUserId, adminId);

      assert.equal(result.message, 'User and associated data deleted.');

      // Verify the topological order of deletion:
      // 1. Applications by student deleted first
      assert.equal(executedTxCalls[0].entity, 'application');
      assert.deepEqual(executedTxCalls[0].args, { where: { student_id: studentId } });

      // 2. Resumes queried to identify AI analysis references
      assert.equal(executedTxCalls[1].entity, 'resume');
      assert.equal(executedTxCalls[1].action, 'findMany');

      // 3. AI analysis dependent on resumes deleted before resumes
      assert.equal(executedTxCalls[2].entity, 'aiAnalysis');
      assert.deepEqual(executedTxCalls[2].args, {
        where: { resume_id: { in: [resumeId1, resumeId2] } },
      });

      // 4. Applications referencing resumes deleted (defensive)
      assert.equal(executedTxCalls[3].entity, 'application');
      assert.deepEqual(executedTxCalls[3].args, {
        where: { resume_id: { in: [resumeId1, resumeId2] } },
      });

      // 5. Resumes deleted before student
      assert.equal(executedTxCalls[4].entity, 'resume');
      assert.equal(executedTxCalls[4].action, 'deleteMany');
      assert.deepEqual(executedTxCalls[4].args, {
        where: { id: { in: [resumeId1, resumeId2] } },
      });

      // 6. Student profile deleted before user
      assert.equal(executedTxCalls[5].entity, 'student');
      assert.deepEqual(executedTxCalls[5].args, { where: { id: studentId } });

      // 7. User record deleted last
      assert.equal(executedTxCalls[6].entity, 'user');
      assert.deepEqual(executedTxCalls[6].args, { where: { id: targetStudentUserId } });
    });

    it('23. RECRUITER deletion removes jobs, job applications, and profile (preserves company)', async () => {
      const recruiterId = 'rec-1111-1111-4111-8111-111111111111';
      const jobId1 = 'job-1111-1111-4111-8111-111111111111';
      const jobId2 = 'job-2222-2222-4222-8222-222222222222';

      mockPrisma = {
        user: {
          findUnique: async () => ({
            id: targetRecruiterUserId,
            role: 'RECRUITER',
            student: null,
            recruiter: { id: recruiterId },
          }),
        },
        $transaction: async (fn) => {
          const mockTx = {
            job: {
              findMany: async (args) => {
                executedTxCalls.push({ entity: 'job', action: 'findMany', args });
                return [{ id: jobId1 }, { id: jobId2 }];
              },
              deleteMany: async (args) => {
                executedTxCalls.push({ entity: 'job', action: 'deleteMany', args });
                return { count: 2 };
              },
            },
            application: {
              deleteMany: async (args) => {
                executedTxCalls.push({ entity: 'application', action: 'deleteMany', args });
                return { count: 5 };
              },
            },
            recruiter: {
              delete: async (args) => {
                executedTxCalls.push({ entity: 'recruiter', action: 'delete', args });
                return { id: recruiterId };
              },
            },
            user: {
              delete: async (args) => {
                executedTxCalls.push({ entity: 'user', action: 'delete', args });
                return { id: targetRecruiterUserId };
              },
            },
          };
          return await fn(mockTx);
        },
      };

      service = new AdminUserService(mockPrisma);
      const result = await service.deleteUser(targetRecruiterUserId, adminId);

      assert.equal(result.message, 'User and associated data deleted.');

      // Verify sequence:
      // 1. Jobs found
      assert.equal(executedTxCalls[0].entity, 'job');
      assert.equal(executedTxCalls[0].action, 'findMany');

      // 2. Applications submitted to recruiter's jobs deleted before jobs
      assert.equal(executedTxCalls[1].entity, 'application');
      assert.deepEqual(executedTxCalls[1].args, {
        where: { job_id: { in: [jobId1, jobId2] } },
      });

      // 3. Jobs deleted before recruiter
      assert.equal(executedTxCalls[2].entity, 'job');
      assert.equal(executedTxCalls[2].action, 'deleteMany');
      assert.deepEqual(executedTxCalls[2].args, {
        where: { id: { in: [jobId1, jobId2] } },
      });

      // 4. Recruiter profile deleted before user
      assert.equal(executedTxCalls[3].entity, 'recruiter');
      assert.deepEqual(executedTxCalls[3].args, { where: { id: recruiterId } });

      // 5. User record deleted last
      assert.equal(executedTxCalls[4].entity, 'user');
      assert.deepEqual(executedTxCalls[4].args, { where: { id: targetRecruiterUserId } });

      // 6. Confirm company is NOT deleted
      const companyDeletes = executedTxCalls.filter((c) => c.entity === 'company');
      assert.equal(companyDeletes.length, 0);
    });

    it('24. ADMIN deletion deletes target user without attempting non-existent profile cascade', async () => {
      mockPrisma = {
        user: {
          findUnique: async () => ({
            id: targetAdminUserId,
            role: 'ADMIN',
            student: null,
            recruiter: null,
          }),
        },
        $transaction: async (fn) => {
          const mockTx = {
            user: {
              delete: async (args) => {
                executedTxCalls.push({ entity: 'user', action: 'delete', args });
                return { id: targetAdminUserId };
              },
            },
          };
          return await fn(mockTx);
        },
      };

      service = new AdminUserService(mockPrisma);
      const result = await service.deleteUser(targetAdminUserId, adminId);

      assert.equal(result.message, 'User and associated data deleted.');
      assert.equal(executedTxCalls.length, 1);
      assert.equal(executedTxCalls[0].entity, 'user');
      assert.deepEqual(executedTxCalls[0].args, { where: { id: targetAdminUserId } });
    });

    it('25. transaction rolls back completely on any mid-operation failure', async () => {
      mockPrisma = {
        user: {
          findUnique: async () => ({
            id: targetStudentUserId,
            role: 'STUDENT',
            student: { id: 'student-id' },
            recruiter: null,
          }),
        },
        $transaction: async (fn) => {
          const mockTx = {
            application: {
              deleteMany: async () => {
                throw new Error('Database disk error during application cascade');
              },
            },
          };
          return await fn(mockTx);
        },
      };

      service = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => service.deleteUser(targetStudentUserId, adminId),
        (err) => err.message === 'Database disk error during application cascade'
      );
    });
  });

  // =========================================================================
  // 5. Controller Delegation & Envelope Tests (AdminUserController)
  // =========================================================================
  describe('5. AdminUserController Handlers', () => {
    it('26. GET listUsers delegates to service and returns 200 OK envelope', async () => {
      const mockResult = {
        data: [
          {
            id: targetStudentUserId,
            email: 'student@example.com',
            role: 'STUDENT',
            is_banned: false,
            created_at: new Date(),
            student: { first_name: 'John', last_name: 'Doe' },
            recruiter: null,
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      let capturedQuery = null;
      const mockService = {
        listUsers: async (q) => {
          capturedQuery = q;
          return mockResult;
        },
      };

      const controller = new AdminUserController(mockService);
      const query = { page: 1, limit: 20 };
      const response = await controller.listUsers(query);

      assert.deepEqual(capturedQuery, query);
      assert.equal(response.success, true);
      assert.deepEqual(response.data, mockResult.data);
      assert.deepEqual(response.meta, mockResult.meta);
    });

    it('27. DELETE deleteUser delegates to service with admin user context', async () => {
      let capturedId = null;
      let capturedAdminUserId = null;

      const mockService = {
        deleteUser: async (id, adminUserId) => {
          capturedId = id;
          capturedAdminUserId = adminUserId;
          return { message: 'User and associated data deleted.' };
        },
      };

      const controller = new AdminUserController(mockService);
      const adminUser = { userId: adminId, email: 'admin@cf.com', role: 'ADMIN' };
      const response = await controller.deleteUser(targetStudentUserId, adminUser);

      assert.equal(capturedId, targetStudentUserId);
      assert.equal(capturedAdminUserId, adminId);
      assert.deepEqual(response, {
        success: true,
        message: 'User and associated data deleted.',
      });
    });

    it('28. DELETE deleteUser propagates service errors without swallowing', async () => {
      const mockService = {
        deleteUser: async () => {
          throw new Error('Deletion failed');
        },
      };

      const controller = new AdminUserController(mockService);
      const adminUser = { userId: adminId, email: 'admin@cf.com', role: 'ADMIN' };

      await assert.rejects(
        () => controller.deleteUser(targetStudentUserId, adminUser),
        (err) => err.message === 'Deletion failed'
      );
    });
  });
});
