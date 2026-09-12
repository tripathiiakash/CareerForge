const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { JobController } = require('../dist/modules/job/job.controller');
const { AdminJobController } = require('../dist/modules/job/admin-job.controller');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');
const { IS_PUBLIC_KEY } = require('../dist/core/decorators/public.decorator');

describe('Job Controller & Security Guards Test Suite (docs/API.md §5.1, §5.2, §5.3, §5.4, §5.5)', () => {
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

    it('should allow unauthenticated requests when endpoint is marked with @Public()', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockJobController {}
      Reflect.defineMetadata(ROLES_KEY, ['RECRUITER'], MockJobController);
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, mockHandler);

      const anonymousRequest = {};
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => anonymousRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockJobController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });

    it('should attach user in JwtAuthGuard when valid token is provided to a @Public() route', async () => {
      const mockTokenService = {
        verifyToken: async (token) => {
          if (token === 'student-token') {
            return {
              sub: 'student-user-uuid',
              email: 'student@example.com',
              role: 'STUDENT',
            };
          }
          throw new Error('Invalid token');
        },
      };

      const guard = new JwtAuthGuard(mockTokenService, reflector);
      const mockHandler = () => {};
      class MockJobController {}
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, mockHandler);

      const requestWithToken = {
        headers: { authorization: 'Bearer student-token' },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => requestWithToken,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockJobController,
      };

      const allowed = await guard.canActivate(mockContext);
      assert.equal(allowed, true);
      assert.deepEqual(requestWithToken.user, {
        userId: 'student-user-uuid',
        email: 'student@example.com',
        role: 'STUDENT',
      });
    });

    it('should allow request without user in JwtAuthGuard when no token is provided to a @Public() route', async () => {
      const guard = new JwtAuthGuard({}, reflector);
      const mockHandler = () => {};
      class MockJobController {}
      Reflect.defineMetadata(IS_PUBLIC_KEY, true, mockHandler);

      const anonymousRequest = { headers: {} };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => anonymousRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockJobController,
      };

      const allowed = await guard.canActivate(mockContext);
      assert.equal(allowed, true);
      assert.equal(anonymousRequest.user, undefined);
    });
  });

  describe('JobController', () => {
    it('should have RECRUITER role metadata defined on the controller class', () => {
      const reflector = new Reflector();
      const roles = reflector.get(ROLES_KEY, JobController);
      assert.deepEqual(roles, ['RECRUITER']);
    });

    it('should have @Public() metadata defined on listJobs handler', () => {
      const reflector = new Reflector();
      const isPublic = reflector.get(
        IS_PUBLIC_KEY,
        JobController.prototype.listJobs
      );
      assert.equal(isPublic, true);
    });

    it('should have @Public() metadata defined on getJob handler', () => {
      const reflector = new Reflector();
      const isPublic = reflector.get(
        IS_PUBLIC_KEY,
        JobController.prototype.getJob
      );
      assert.equal(isPublic, true);
    });

    it('should route getJob to jobService.getJobById and return 200 OK envelope', async () => {
      const mockJobDetail = {
        id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        title: 'Junior Backend Developer',
        description: 'We are looking for a developer...',
        required_skills: ['Node.js'],
        employment_type: 'FULL_TIME',
        company: {
          id: 'comp-uuid',
          name: 'TechNova Solutions',
          website: 'https://technova.example.com',
          logo_url: null,
        },
        has_applied: false,
        created_at: new Date('2024-02-05T12:00:00.000Z'),
      };

      let capturedId = null;
      let capturedUser = null;
      const mockService = {
        getJobById: async (id, user) => {
          capturedId = id;
          capturedUser = user;
          return mockJobDetail;
        },
      };

      const controller = new JobController(mockService);
      const studentUser = {
        userId: 'student-id',
        email: 'student@example.com',
        role: 'STUDENT',
      };

      const response = await controller.getJob(
        'e42e476e-3607-4e68-9a2f-98eb413ce161',
        studentUser
      );

      assert.equal(capturedId, 'e42e476e-3607-4e68-9a2f-98eb413ce161');
      assert.deepEqual(capturedUser, studentUser);
      assert.deepEqual(response, {
        success: true,
        data: mockJobDetail,
      });
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

    it('should route updateJob to jobService and return 200 OK envelope with data', async () => {
      const jobId = 'e42e476e-3607-4e68-9a2f-98eb413ce161';
      const inputDto = {
        title: 'Junior Backend Developer (Updated)',
        required_skills: ['Node.js', 'PostgreSQL', 'Docker'],
      };

      const mockUpdatedData = {
        id: jobId,
        title: 'Junior Backend Developer (Updated)',
        status: 'ACTIVE',
        message: 'Job updated successfully.',
      };

      let capturedUserId = null;
      let capturedJobId = null;
      let capturedDto = null;
      const mockService = {
        updateJob: async (userId, id, dto) => {
          capturedUserId = userId;
          capturedJobId = id;
          capturedDto = dto;
          return mockUpdatedData;
        },
      };

      const controller = new JobController(mockService);
      const response = await controller.updateJob(
        'user-recruiter-id',
        jobId,
        inputDto
      );

      assert.equal(capturedUserId, 'user-recruiter-id');
      assert.equal(capturedJobId, jobId);
      assert.deepEqual(capturedDto, inputDto);
      assert.deepEqual(response, {
        success: true,
        data: mockUpdatedData,
      });
    });

    it('should propagate updateJob service errors (e.g. 403 or 404) without swallowing', async () => {
      const mockForbidden = new Error('Recruiter does not own this job');
      mockForbidden.status = 403;

      const mockService = {
        updateJob: async () => {
          throw mockForbidden;
        },
      };

      const controller = new JobController(mockService);

      await assert.rejects(
        () =>
          controller.updateJob('user-id', 'job-id', {
            title: 'Updated',
          }),
        (err) => err === mockForbidden && err.status === 403
      );
    });

    it('should route deleteJob to jobService and return 200 OK envelope with message', async () => {
      const jobId = 'e42e476e-3607-4e68-9a2f-98eb413ce161';

      let capturedUserId = null;
      let capturedJobId = null;
      const mockService = {
        deleteJob: async (userId, id) => {
          capturedUserId = userId;
          capturedJobId = id;
          return { message: 'Job deleted successfully.' };
        },
      };

      const controller = new JobController(mockService);
      const response = await controller.deleteJob('user-recruiter-id', jobId);

      assert.equal(capturedUserId, 'user-recruiter-id');
      assert.equal(capturedJobId, jobId);
      assert.deepEqual(response, {
        success: true,
        message: 'Job deleted successfully.',
      });
    });

    it('should propagate deleteJob service errors (e.g. 403 or 404) without swallowing', async () => {
      const mockNotFound = new Error('Job does not exist');
      mockNotFound.status = 404;

      const mockService = {
        deleteJob: async () => {
          throw mockNotFound;
        },
      };

      const controller = new JobController(mockService);

      await assert.rejects(
        () => controller.deleteJob('user-id', 'job-id'),
        (err) => err === mockNotFound && err.status === 404
      );
    });

    it('should route listJobs to jobService and return 200 OK envelope with data and meta', async () => {
      const mockJobsData = [
        {
          id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
          title: 'Junior Backend Developer',
          company: {
            id: '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47',
            name: 'TechNova Solutions',
            logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
          },
          required_skills: ['Node.js', 'PostgreSQL'],
          employment_type: 'FULL_TIME',
          created_at: new Date('2024-02-05T12:00:00.000Z'),
        },
      ];

      const mockMeta = {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      let capturedQuery = null;
      const mockService = {
        listJobs: async (query) => {
          capturedQuery = query;
          return {
            data: mockJobsData,
            meta: mockMeta,
          };
        },
      };

      const controller = new JobController(mockService);
      const queryDto = { page: 1, limit: 10, search: 'backend' };
      const response = await controller.listJobs(queryDto);

      assert.deepEqual(capturedQuery, queryDto);
      assert.deepEqual(response, {
        success: true,
        data: mockJobsData,
        meta: mockMeta,
      });
    });

    it('should propagate listJobs service errors without swallowing', async () => {
      const mockDbError = new Error('Database query failure');
      const mockService = {
        listJobs: async () => {
          throw mockDbError;
        },
      };

      const controller = new JobController(mockService);

      await assert.rejects(
        () => controller.listJobs({}),
        (err) => err === mockDbError
      );
    });
  });

  describe('RolesGuard with ADMIN Role (Phase 4.3.4 - docs/API.md §9.2)', () => {
    const reflector = new Reflector();

    it('should reject users with STUDENT role when ADMIN role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockAdminController {}
      Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], MockAdminController);

      const studentRequest = {
        user: { userId: 'user-student', role: 'STUDENT' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => studentRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockAdminController,
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

    it('should reject users with RECRUITER role when ADMIN role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockAdminController {}
      Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], MockAdminController);

      const recruiterRequest = {
        user: { userId: 'user-recruiter', role: 'RECRUITER' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => recruiterRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockAdminController,
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

    it('should reject unauthenticated requests when ADMIN role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockAdminController {}
      Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], MockAdminController);

      const anonymousRequest = {};
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => anonymousRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockAdminController,
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

    it('should allow users with ADMIN role', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockAdminController {}
      Reflect.defineMetadata(ROLES_KEY, ['ADMIN'], MockAdminController);

      const adminRequest = {
        user: { userId: 'user-admin', role: 'ADMIN' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => adminRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockAdminController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });
  });

  describe('AdminJobController (Phase 4.3.4 - docs/API.md §9.2)', () => {
    const reflector = new Reflector();

    it('should have ADMIN role metadata defined on the controller class', () => {
      const roles = reflector.get(ROLES_KEY, AdminJobController);
      assert.deepEqual(roles, ['ADMIN']);
    });

    it('should route moderateJobStatus to jobService and return 200 OK envelope', async () => {
      const jobId = '11111111-1111-4111-8111-111111111111';
      const mockModeratedData = {
        id: jobId,
        status: 'ACTIVE',
        message: 'Job approved and now visible to students.',
      };

      let capturedJobId = null;
      let capturedDto = null;
      const mockService = {
        moderateJobStatus: async (id, dto) => {
          capturedJobId = id;
          capturedDto = dto;
          return mockModeratedData;
        },
      };

      const controller = new AdminJobController(mockService);
      const dto = { status: 'ACTIVE' };
      const response = await controller.moderateJobStatus(jobId, dto);

      assert.equal(capturedJobId, jobId);
      assert.deepEqual(capturedDto, dto);
      assert.deepEqual(response, {
        success: true,
        data: mockModeratedData,
      });
    });

    it('should propagate moderateJobStatus service errors without swallowing', async () => {
      const mockError = new Error('Service failure');
      const mockService = {
        moderateJobStatus: async () => {
          throw mockError;
        },
      };

      const controller = new AdminJobController(mockService);

      await assert.rejects(
        () =>
          controller.moderateJobStatus('11111111-1111-4111-8111-111111111111', {
            status: 'ACTIVE',
          }),
        (err) => err === mockError
      );
    });
  });
});
