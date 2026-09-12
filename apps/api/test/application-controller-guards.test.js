const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  ApplicationController,
} = require('../dist/modules/application/application.controller');
const {
  StudentController,
} = require('../dist/modules/student/student.controller');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Application Controller & Security Guards Test Suite (docs/API.md §8.1)', () => {
  const reflector = new Reflector();

  describe('RolesGuard with STUDENT Role', () => {
    it('should reject users with RECRUITER role when STUDENT role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockController {}
      Reflect.defineMetadata(ROLES_KEY, ['STUDENT'], MockController);

      const recruiterRequest = {
        user: { userId: 'user-recruiter', role: 'RECRUITER' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => recruiterRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockController,
      };

      assert.throws(
        () => guard.canActivate(mockContext),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('should reject users with ADMIN role when STUDENT role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockController {}
      Reflect.defineMetadata(ROLES_KEY, ['STUDENT'], MockController);

      const adminRequest = {
        user: { userId: 'user-admin', role: 'ADMIN' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => adminRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockController,
      };

      assert.throws(
        () => guard.canActivate(mockContext),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('should reject unauthenticated or missing user requests', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockController {}
      Reflect.defineMetadata(ROLES_KEY, ['STUDENT'], MockController);

      const anonymousRequest = {};
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => anonymousRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockController,
      };

      assert.throws(
        () => guard.canActivate(mockContext),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Insufficient role permissions for this resource'
      );
    });

    it('should allow users with STUDENT role', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockController {}
      Reflect.defineMetadata(ROLES_KEY, ['STUDENT'], MockController);

      const studentRequest = {
        user: { userId: 'user-student', role: 'STUDENT' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => studentRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });
  });

  describe('ApplicationController', () => {
    it('should have STUDENT role metadata defined on the controller class', () => {
      const roles = reflector.get(ROLES_KEY, ApplicationController);
      assert.deepEqual(roles, ['STUDENT']);
    });

    it('should route applyToJob to applicationService and return 201 Created envelope', async () => {
      const userId = 'user-student-123';
      const jobId = '33333333-3333-4333-8333-333333333333';
      const dto = { resume_id: '44444444-4444-4444-8444-444444444444' };
      const mockCreatedData = {
        application_id: '55555555-5555-4555-8555-555555555555',
        status: 'APPLIED',
        applied_at: new Date('2024-02-10T14:30:00.000Z'),
        message: 'Successfully applied to the job.',
      };

      let capturedUserId = null;
      let capturedJobId = null;
      let capturedDto = null;
      const mockService = {
        applyToJob: async (uId, jId, d) => {
          capturedUserId = uId;
          capturedJobId = jId;
          capturedDto = d;
          return mockCreatedData;
        },
      };

      const controller = new ApplicationController(mockService);
      const response = await controller.applyToJob(userId, jobId, dto);

      assert.equal(capturedUserId, userId);
      assert.equal(capturedJobId, jobId);
      assert.deepEqual(capturedDto, dto);
      assert.deepEqual(response, {
        success: true,
        data: mockCreatedData,
      });
    });

    it('should propagate applyToJob service errors without swallowing', async () => {
      const mockServiceError = new Error('Service failure');
      const mockService = {
        applyToJob: async () => {
          throw mockServiceError;
        },
      };

      const controller = new ApplicationController(mockService);

      await assert.rejects(
        () =>
          controller.applyToJob(
            'user-student-123',
            '33333333-3333-4333-8333-333333333333',
            { resume_id: '44444444-4444-4444-8444-444444444444' }
          ),
        (err) => err === mockServiceError
      );
    });
  });

  describe('StudentController - getMyApplications (Phase 4.4.2 - docs/API.md §2.3)', () => {
    it('should have STUDENT role metadata defined on the StudentController class', () => {
      const roles = reflector.get(ROLES_KEY, StudentController);
      assert.deepEqual(roles, ['STUDENT']);
    });

    it('should route getMyApplications to applicationService and return 200 OK envelope', async () => {
      const userId = 'user-student-123';
      const queryDto = { page: 1, limit: 10, status: 'SHORTLISTED' };
      const mockResultData = [
        {
          application_id: 'app-1',
          status: 'SHORTLISTED',
          applied_at: new Date('2024-02-10T14:30:00.000Z'),
          updated_at: new Date('2024-02-12T09:15:00.000Z'),
          job: {
            id: 'job-1',
            title: 'Junior Backend Developer',
            employment_type: 'FULL_TIME',
            company_name: 'TechNova Solutions',
          },
        },
      ];
      const mockMeta = {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      let capturedUserId = null;
      let capturedQuery = null;
      const mockApplicationService = {
        getStudentApplications: async (uId, q) => {
          capturedUserId = uId;
          capturedQuery = q;
          return {
            data: mockResultData,
            meta: mockMeta,
          };
        },
      };

      const mockStudentService = {};
      const controller = new StudentController(
        mockStudentService,
        mockApplicationService
      );
      const response = await controller.getMyApplications(userId, queryDto);

      assert.equal(capturedUserId, userId);
      assert.deepEqual(capturedQuery, queryDto);
      assert.deepEqual(response, {
        success: true,
        data: mockResultData,
        meta: mockMeta,
      });
    });

    it('should propagate getMyApplications service errors without swallowing', async () => {
      const mockServiceError = new Error('Database failure');
      const mockApplicationService = {
        getStudentApplications: async () => {
          throw mockServiceError;
        },
      };

      const mockStudentService = {};
      const controller = new StudentController(
        mockStudentService,
        mockApplicationService
      );

      await assert.rejects(
        () => controller.getMyApplications('user-student-123', {}),
        (err) => err === mockServiceError
      );
    });
  });
});
