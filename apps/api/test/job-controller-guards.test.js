const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { JobController } = require('../dist/modules/job/job.controller');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Job Controller & Security Guards Test Suite (docs/API.md §5.1)', () => {
  describe('RolesGuard with RECRUITER Role', () => {
    const reflector = new Reflector();

    it('should reject users with STUDENT role when RECRUITER role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockJobController {}
      Reflect.defineMetadata(ROLES_KEY, ['RECRUITER'], MockJobController);

      const studentRequest = {
        user: { userId: 'user-student', role: 'STUDENT' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => studentRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockJobController,
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
      class MockJobController {}
      Reflect.defineMetadata(ROLES_KEY, ['RECRUITER'], MockJobController);

      const anonymousRequest = {};
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => anonymousRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockJobController,
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

    it('should allow users with RECRUITER role', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockJobController {}
      Reflect.defineMetadata(ROLES_KEY, ['RECRUITER'], MockJobController);

      const recruiterRequest = {
        user: { userId: 'user-recruiter', role: 'RECRUITER' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => recruiterRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockJobController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });
  });

  describe('JobController', () => {
    it('should have RECRUITER role metadata defined on the controller class', () => {
      const reflector = new Reflector();
      const roles = reflector.get(ROLES_KEY, JobController);
      assert.deepEqual(roles, ['RECRUITER']);
    });

    it('should route createJob to jobService and return 201 Created envelope', async () => {
      const inputDto = {
        title: 'Junior Backend Developer',
        description:
          'We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...',
        required_skills: ['Node.js', 'PostgreSQL', 'REST APIs'],
        employment_type: 'FULL_TIME',
      };

      const mockJobData = {
        id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        status: 'PENDING',
        message: 'Job created and pending admin approval.',
      };

      let capturedUserId = null;
      let capturedDto = null;
      const mockService = {
        createJob: async (userId, dto) => {
          capturedUserId = userId;
          capturedDto = dto;
          return mockJobData;
        },
      };

      const controller = new JobController(mockService);
      const response = await controller.createJob(
        'user-recruiter-id',
        inputDto
      );

      assert.equal(capturedUserId, 'user-recruiter-id');
      assert.deepEqual(capturedDto, inputDto);
      assert.deepEqual(response, {
        success: true,
        data: mockJobData,
      });
    });

    it('should propagate service errors (e.g. 400 or 404) without swallowing', async () => {
      const mockError = new Error('Recruiter has no linked company');
      mockError.status = 400;

      const mockService = {
        createJob: async () => {
          throw mockError;
        },
      };

      const controller = new JobController(mockService);

      await assert.rejects(
        () => controller.createJob('user-id', {}),
        (err) => err === mockError && err.status === 400
      );
    });
  });
});
