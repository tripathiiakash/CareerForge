const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');
const {
  AdminMetricsController,
} = require('../dist/modules/admin/admin-metrics.controller');
const {
  AdminMetricsService,
} = require('../dist/modules/admin/admin-metrics.service');
const {
  AdminUserController,
} = require('../dist/modules/admin/admin-user.controller');
const {
  AdminUserService,
} = require('../dist/modules/admin/admin-user.service');
const {
  AdminJobController,
} = require('../dist/modules/job/admin-job.controller');
const { AdminModule } = require('../dist/modules/admin/admin.module');

describe('Phase 5.15.0 — Admin Platform Analytics & Metrics Backend Contract Test Suite', () => {
  const adminId = '11111111-1111-4111-8111-111111111111';
  const studentId = '22222222-2222-4222-8222-222222222222';
  const recruiterId = '33333333-3333-4333-8333-333333333333';

  // =========================================================================
  // 1. Authorization & Role Guards (docs/API.md §9.5)
  // =========================================================================
  describe('1. Authorization & Security Guard Checks', () => {
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminMetricsController,
    });

    it('1. Controller is decorated with ADMIN role metadata', () => {
      const roles = reflector.get(ROLES_KEY, AdminMetricsController);
      assert.deepEqual(roles, ['ADMIN']);
    });

    it('2. ADMIN role is allowed to access GET /api/v1/admin/metrics', () => {
      const adminUser = { userId: adminId, role: 'ADMIN' };
      const allowed = rolesGuard.canActivate(createMockContext(adminUser));
      assert.equal(allowed, true);
    });

    it('3. STUDENT role is rejected with 403 Forbidden', () => {
      const studentUser = { userId: studentId, role: 'STUDENT' };
      assert.throws(
        () => rolesGuard.canActivate(createMockContext(studentUser)),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('4. RECRUITER role is rejected with 403 Forbidden', () => {
      const recruiterUser = { userId: recruiterId, role: 'RECRUITER' };
      assert.throws(
        () => rolesGuard.canActivate(createMockContext(recruiterUser)),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('5. Unauthenticated request without user context is rejected by RolesGuard with 403', () => {
      assert.throws(
        () => rolesGuard.canActivate(createMockContext(null)),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('6. Unauthenticated request without Authorization header is rejected by JwtAuthGuard with 401', async () => {
      const jwtGuard = new JwtAuthGuard({}, reflector);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
        getHandler: () => () => {},
        getClass: () => AdminMetricsController,
      };

      await assert.rejects(
        () => jwtGuard.canActivate(mockContext),
        (err) =>
          err.status === 401 &&
          err.response.code === 'UNAUTHORIZED' &&
          err.response.message === 'Missing authorization token'
      );
    });

    it('7. Request with invalid or non-Bearer authorization header is rejected by JwtAuthGuard with 401', async () => {
      const jwtGuard = new JwtAuthGuard({}, reflector);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Basic YWRtaW46cGFzc3dvcmQ=' },
          }),
        }),
        getHandler: () => () => {},
        getClass: () => AdminMetricsController,
      };

      await assert.rejects(
        () => jwtGuard.canActivate(mockContext),
        (err) =>
          err.status === 401 &&
          err.response.code === 'UNAUTHORIZED' &&
          err.response.message === 'Missing authorization token'
      );
    });
  });

  // =========================================================================
  // 2. AdminMetricsService: Database Aggregations & Query Integrity
  // =========================================================================
  describe('2. AdminMetricsService Query Aggregations', () => {
    let service;
    let mockPrisma;
    let countQueries;

    beforeEach(() => {
      countQueries = {
        user: [],
        job: [],
        application: [],
      };

      mockPrisma = {
        user: {
          count: async (args) => {
            countQueries.user.push(args);
            if (args?.where?.role === 'STUDENT') return 1420;
            if (args?.where?.role === 'RECRUITER') return 45;
            return 0;
          },
        },
        job: {
          count: async (args) => {
            countQueries.job.push(args);
            if (args?.where?.status === 'ACTIVE') return 28;
            if (args?.where?.status === 'PENDING') return 3;
            return 0;
          },
        },
        application: {
          count: async (args) => {
            countQueries.application.push(args);
            return 3890;
          },
        },
      };

      service = new AdminMetricsService(mockPrisma);
    });

    it('8. Generates correct count queries for all 5 metrics', async () => {
      await service.getMetrics();

      // Check user queries
      assert.equal(countQueries.user.length, 2);
      assert.deepEqual(countQueries.user[0], { where: { role: 'STUDENT' } });
      assert.deepEqual(countQueries.user[1], { where: { role: 'RECRUITER' } });

      // Check job queries
      assert.equal(countQueries.job.length, 2);
      assert.deepEqual(countQueries.job[0], { where: { status: 'ACTIVE' } });
      assert.deepEqual(countQueries.job[1], { where: { status: 'PENDING' } });

      // Check application query
      assert.equal(countQueries.application.length, 1);
      assert.deepEqual(countQueries.application[0], undefined);
    });

    it('9. Maps database counts accurately to docs/API.md §9.5 response shape', async () => {
      const metrics = await service.getMetrics();

      assert.deepEqual(metrics, {
        total_students: 1420,
        total_recruiters: 45,
        active_jobs: 28,
        pending_jobs: 3,
        total_applications: 3890,
      });

      // Verify all metrics are strictly numbers
      assert.equal(typeof metrics.total_students, 'number');
      assert.equal(typeof metrics.total_recruiters, 'number');
      assert.equal(typeof metrics.active_jobs, 'number');
      assert.equal(typeof metrics.pending_jobs, 'number');
      assert.equal(typeof metrics.total_applications, 'number');
    });

    it('10. Zero-count database state returns numeric zeros, never null or undefined', async () => {
      const zeroMockPrisma = {
        user: { count: async () => 0 },
        job: { count: async () => 0 },
        application: { count: async () => 0 },
      };
      const zeroService = new AdminMetricsService(zeroMockPrisma);

      const metrics = await zeroService.getMetrics();

      assert.deepEqual(metrics, {
        total_students: 0,
        total_recruiters: 0,
        active_jobs: 0,
        pending_jobs: 0,
        total_applications: 0,
      });

      assert.strictEqual(metrics.total_students, 0);
      assert.strictEqual(metrics.total_recruiters, 0);
      assert.strictEqual(metrics.active_jobs, 0);
      assert.strictEqual(metrics.pending_jobs, 0);
      assert.strictEqual(metrics.total_applications, 0);
    });

    it('11. Never leaks sensitive fields, entity models, passwords, or internal IDs', async () => {
      const metrics = await service.getMetrics();

      const forbiddenFields = [
        'password',
        'password_hash',
        'salt',
        'token',
        'secret',
        'id',
        'userId',
        'email',
        'first_name',
        'last_name',
        'company_id',
        'student_id',
        'recruiter_id',
      ];

      for (const field of forbiddenFields) {
        assert.equal(
          metrics[field],
          undefined,
          `Metric payload leaked forbidden field: ${field}`
        );
      }

      // Assert payload has exactly the 5 documented keys and no extras
      const expectedKeys = [
        'total_students',
        'total_recruiters',
        'active_jobs',
        'pending_jobs',
        'total_applications',
      ];
      assert.deepEqual(Object.keys(metrics).sort(), expectedKeys.sort());
    });
  });

  // =========================================================================
  // 3. AdminMetricsController Handlers & Response Envelope
  // =========================================================================
  describe('3. AdminMetricsController Handlers', () => {
    it('12. GET /admin/metrics delegates to service and returns 200 OK envelope', async () => {
      const mockMetricsData = {
        total_students: 100,
        total_recruiters: 10,
        active_jobs: 15,
        pending_jobs: 2,
        total_applications: 500,
      };

      const mockService = {
        getMetrics: async () => mockMetricsData,
      };

      const controller = new AdminMetricsController(mockService);
      const result = await controller.getMetrics();

      assert.deepEqual(result, {
        success: true,
        data: mockMetricsData,
      });
    });

    it('13. Propagates unexpected service exceptions to global exception filter', async () => {
      const mockService = {
        getMetrics: async () => {
          throw new Error('Database connection failure');
        },
      };

      const controller = new AdminMetricsController(mockService);
      await assert.rejects(
        () => controller.getMetrics(),
        (err) => err.message === 'Database connection failure'
      );
    });
  });

  // =========================================================================
  // 4. Non-Regression & Module Integrity
  // =========================================================================
  describe('4. Non-Regression & Module Registration', () => {
    it('14. AdminUserController endpoints (listUsers, deleteUser) remain intact', () => {
      assert.equal(typeof AdminUserController.prototype.listUsers, 'function');
      assert.equal(typeof AdminUserController.prototype.deleteUser, 'function');
    });

    it('15. AdminJobController endpoints (listPendingJobs, moderateJobStatus) remain intact', () => {
      assert.equal(
        typeof AdminJobController.prototype.listPendingJobs,
        'function'
      );
      assert.equal(
        typeof AdminJobController.prototype.moderateJobStatus,
        'function'
      );
    });

    it('16. AdminModule registers both AdminUserController and AdminMetricsController', () => {
      const controllers = Reflect.getMetadata('controllers', AdminModule) || [];
      assert.ok(
        controllers.includes(AdminUserController),
        'AdminUserController must be registered in AdminModule'
      );
      assert.ok(
        controllers.includes(AdminMetricsController),
        'AdminMetricsController must be registered in AdminModule'
      );
    });

    it('17. AdminModule provides and exports both AdminUserService and AdminMetricsService', () => {
      const providers = Reflect.getMetadata('providers', AdminModule) || [];
      const exportsList = Reflect.getMetadata('exports', AdminModule) || [];

      assert.ok(
        providers.includes(AdminUserService),
        'AdminUserService must be provided in AdminModule'
      );
      assert.ok(
        providers.includes(AdminMetricsService),
        'AdminMetricsService must be provided in AdminModule'
      );
      assert.ok(
        exportsList.includes(AdminUserService),
        'AdminUserService must be exported from AdminModule'
      );
      assert.ok(
        exportsList.includes(AdminMetricsService),
        'AdminMetricsService must be exported from AdminModule'
      );
    });
  });
});
