const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  ResumeController,
} = require('../dist/modules/resume/resume.controller');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Resume Controller & Security Guards Test Suite', () => {
  describe('JwtAuthGuard', () => {
    const mockReflector = new Reflector();

    it('should throw 401 UnauthorizedException if Authorization header is missing', async () => {
      const guard = new JwtAuthGuard({}, mockReflector);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(mockContext),
        (err) => err.status === 401 && err.response.code === 'UNAUTHORIZED'
      );
    });

    it('should throw 401 UnauthorizedException if Authorization header is not Bearer format', async () => {
      const guard = new JwtAuthGuard({}, mockReflector);
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Basic dXNlcjpwYXNz' },
          }),
        }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(mockContext),
        (err) => err.status === 401 && err.response.code === 'UNAUTHORIZED'
      );
    });

    it('should attach decoded user payload to request upon successful token verification', async () => {
      const mockTokenService = {
        verifyToken: async (token) => {
          if (token === 'valid-student-jwt') {
            return {
              sub: 'student-user-id-123',
              email: 'student@example.com',
              role: 'STUDENT',
            };
          }
          throw new Error('Invalid token');
        },
      };

      const guard = new JwtAuthGuard(mockTokenService, mockReflector);
      const mockRequest = {
        headers: { authorization: 'Bearer valid-student-jwt' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      const canActivate = await guard.canActivate(mockContext);
      assert.equal(canActivate, true);
      assert.deepEqual(mockRequest.user, {
        userId: 'student-user-id-123',
        email: 'student@example.com',
        role: 'STUDENT',
      });
    });
  });

  describe('RolesGuard', () => {
    const reflector = new Reflector();

    it('should reject users with non-student roles when STUDENT role is required', () => {
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
        (err) => err.status === 403 && err.response.code === 'FORBIDDEN'
      );
    });

    it('should allow users with STUDENT role when STUDENT role is required', () => {
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

  describe('ResumeController', () => {
    it('should have STUDENT role metadata defined on the controller class', () => {
      const reflector = new Reflector();
      const roles = reflector.get(ROLES_KEY, ResumeController);
      assert.deepEqual(roles, ['STUDENT']);
    });

    it('should route triggerAnalysis to service and return 202 Accepted envelope', async () => {
      const mockService = {};
      const mockAnalysisService = {
        triggerAnalysis: async (userId, resumeId) => ({
          resume_id: resumeId,
          status: 'PROCESSING',
          message: 'Resume analysis enqueued.',
        }),
      };

      const controller = new ResumeController(mockService, mockAnalysisService);
      const response = await controller.triggerAnalysis(
        'student-user-id',
        'resume-uuid-123'
      );

      assert.deepEqual(response, {
        success: true,
        data: {
          resume_id: 'resume-uuid-123',
          status: 'PROCESSING',
          message: 'Resume analysis enqueued.',
        },
      });
    });

    it('should route getAnalysis to service and return 200 envelope', async () => {
      const mockService = {};
      const mockAnalysisService = {
        getAnalysis: async (userId, resumeId) => ({
          status: 'COMPLETED',
          analysis: {
            score: 90,
            missing_skills: ['AWS'],
            formatting_tips: ['Add impact metrics'],
            created_at: '2026-09-11T12:00:00.000Z',
          },
        }),
      };

      const controller = new ResumeController(mockService, mockAnalysisService);
      const response = await controller.getAnalysis(
        'student-user-id',
        'resume-uuid-123'
      );

      assert.deepEqual(response, {
        success: true,
        data: {
          status: 'COMPLETED',
          analysis: {
            score: 90,
            missing_skills: ['AWS'],
            formatting_tips: ['Add impact metrics'],
            created_at: '2026-09-11T12:00:00.000Z',
          },
        },
      });
    });
  });
});
