const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  ResumeController,
} = require('../dist/modules/resume/resume.controller');
const { ResumeService } = require('../dist/modules/resume/resume.service');
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

    it('should throw 401 UnauthorizedException if token is only present in query parameter', async () => {
      const mockTokenService = {
        verifyToken: async () => {
          throw new Error('Should not be called');
        },
      };

      const guard = new JwtAuthGuard(mockTokenService, mockReflector);
      const mockRequest = {
        headers: {},
        query: { token: 'valid-query-jwt' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(mockContext),
        (err) => err.status === 401 && err.response.code === 'UNAUTHORIZED'
      );
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

    it('should allow RECRUITER or ADMIN when method-level roles override class-level roles', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockController {}
      Reflect.defineMetadata(ROLES_KEY, ['STUDENT'], MockController);
      Reflect.defineMetadata(
        ROLES_KEY,
        ['STUDENT', 'RECRUITER', 'ADMIN'],
        mockHandler
      );

      for (const role of ['STUDENT', 'RECRUITER', 'ADMIN']) {
        const mockContext = {
          switchToHttp: () => ({
            getRequest: () => ({ user: { userId: `user-${role}`, role } }),
          }),
          getHandler: () => mockHandler,
          getClass: () => MockController,
        };
        assert.equal(guard.canActivate(mockContext), true);
      }
    });
  });

  describe('ResumeController', () => {
    it('should have STUDENT role metadata defined on the controller class', () => {
      const reflector = new Reflector();
      const roles = reflector.get(ROLES_KEY, ResumeController);
      assert.deepEqual(roles, ['STUDENT']);
    });

    it('should have multi-role metadata defined on file download methods', () => {
      const reflector = new Reflector();
      const fileKeyRoles = reflector.get(
        ROLES_KEY,
        ResumeController.prototype.getResumeByFileKey
      );
      const resumeIdRoles = reflector.get(
        ROLES_KEY,
        ResumeController.prototype.getResumeFile
      );
      assert.deepEqual(fileKeyRoles, ['STUDENT', 'RECRUITER', 'ADMIN']);
      assert.deepEqual(resumeIdRoles, ['STUDENT', 'RECRUITER', 'ADMIN']);
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

    it('should stream PDF buffer with secure inline headers on getResumeFile', async () => {
      const dummyPdfBuffer = Buffer.from('%PDF-1.4 mock content');
      const mockService = {
        getResumeFile: async (userId, userRole, identifier) => ({
          buffer: dummyPdfBuffer,
          fileName: 'Resume_Test.pdf',
        }),
      };
      const mockAnalysisService = {};

      const controller = new ResumeController(mockService, mockAnalysisService);
      const headers = {};
      let sentBody = null;
      const mockRes = {
        setHeader: (key, val) => {
          headers[key.toLowerCase()] = val;
        },
        send: (body) => {
          sentBody = body;
        },
      };

      await controller.getResumeFile(
        'user-1',
        'STUDENT',
        '11111111-1111-1111-1111-111111111111',
        mockRes
      );

      assert.equal(headers['content-type'], 'application/pdf');
      assert.equal(
        headers['content-disposition'],
        'inline; filename="Resume_Test.pdf"'
      );
      assert.equal(headers['x-content-type-options'], 'nosniff');
      assert.equal(
        headers['cache-control'],
        'private, no-cache, no-store, must-revalidate'
      );
      assert.equal(sentBody, dummyPdfBuffer);
    });

    it('should stream PDF buffer with secure inline headers on getResumeByFileKey', async () => {
      const dummyPdfBuffer = Buffer.from('%PDF-1.4 file key content');
      const mockService = {
        getResumeFile: async (userId, userRole, identifier) => ({
          buffer: dummyPdfBuffer,
          fileName: 'my-resume.pdf',
        }),
      };
      const mockAnalysisService = {};

      const controller = new ResumeController(mockService, mockAnalysisService);
      const headers = {};
      let sentBody = null;
      const mockRes = {
        setHeader: (key, val) => {
          headers[key.toLowerCase()] = val;
        },
        send: (body) => {
          sentBody = body;
        },
      };

      await controller.getResumeByFileKey(
        'user-recruiter-1',
        'RECRUITER',
        'my-resume.pdf',
        mockRes
      );

      assert.equal(headers['content-type'], 'application/pdf');
      assert.equal(
        headers['content-disposition'],
        'inline; filename="my-resume.pdf"'
      );
      assert.equal(headers['x-content-type-options'], 'nosniff');
      assert.equal(sentBody, dummyPdfBuffer);
    });
  });

  describe('ResumeService - getResumeFile Security & Ownership', () => {
    const mockStorageService = {
      getFileBuffer: async (fileKey) => Buffer.from('%PDF-1.4 file content'),
    };
    const mockStudentService = {};
    const mockQueueService = {};

    it('should throw 404 NOT_FOUND if resume record cannot be found', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => null,
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      await assert.rejects(
        () =>
          service.getResumeFile(
            'user-1',
            'STUDENT',
            '00000000-0000-0000-0000-000000000000'
          ),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('should throw 403 FORBIDDEN if student tries to access another student resume', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-1',
            student_id: 'student-profile-A',
            file_url: 'http://localhost:5000/api/v1/resumes/file/resume-A.pdf',
            student: {
              user_id: 'user-A',
              first_name: 'Alice',
              last_name: 'Smith',
            },
          }),
        },
        studentProfile: {
          findUnique: async () => ({ id: 'student-profile-B' }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      // User B attempts to access User A's resume
      await assert.rejects(
        () => service.getResumeFile('user-B', 'STUDENT', 'resume-uuid-1'),
        (err) => err.status === 403 && err.response.code === 'FORBIDDEN'
      );
    });

    it('should succeed if student accesses their own resume', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-1',
            student_id: 'student-profile-A',
            file_url: 'http://localhost:5000/api/v1/resumes/file/resume-A.pdf',
            student: {
              user_id: 'user-A',
              first_name: 'Alice',
              last_name: 'Smith',
            },
          }),
        },
        studentProfile: {
          findUnique: async () => ({ id: 'student-profile-A' }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      const result = await service.getResumeFile(
        'user-A',
        'STUDENT',
        'resume-uuid-1'
      );
      assert.ok(result.buffer);
      assert.equal(result.fileName, 'resume-A.pdf');
    });

    it('should throw 403 FORBIDDEN if recruiter accesses resume of candidate who did not apply to recruiter jobs', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-1',
            student_id: 'student-profile-A',
            file_url: 'http://localhost:5000/api/v1/resumes/file/resume-A.pdf',
            student: {
              user_id: 'user-A',
              first_name: 'Alice',
              last_name: 'Smith',
            },
          }),
        },
        recruiterProfile: {
          findUnique: async () => ({ id: 'recruiter-profile-1' }),
        },
        application: {
          findFirst: async () => null, // No application found for recruiter's jobs
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      await assert.rejects(
        () => service.getResumeFile('recruiter-user-1', 'RECRUITER', 'resume-uuid-1'),
        (err) => err.status === 403 && err.response.code === 'FORBIDDEN'
      );
    });

    it('should succeed if recruiter accesses resume of an applicant to their job', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-1',
            student_id: 'student-profile-A',
            file_url: 'http://localhost:5000/api/v1/resumes/file/resume-A.pdf',
            student: {
              user_id: 'user-A',
              first_name: 'Alice',
              last_name: 'Smith',
            },
          }),
        },
        recruiterProfile: {
          findUnique: async () => ({ id: 'recruiter-profile-1' }),
        },
        application: {
          findFirst: async () => ({ id: 'application-1' }), // Found an application!
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      const result = await service.getResumeFile(
        'recruiter-user-1',
        'RECRUITER',
        'resume-uuid-1'
      );
      assert.ok(result.buffer);
      assert.equal(result.fileName, 'resume-A.pdf');
    });

    it('should format student name for UUID file keys when ADMIN accesses resume', async () => {
      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: 'resume-uuid-1',
            student_id: 'student-profile-A',
            file_url:
              'http://localhost:5000/api/v1/resumes/file/9ad4cd0b-6581-4ed9-849e-22d9d421b7f1.pdf',
            student: {
              user_id: 'user-A',
              first_name: 'Alice',
              last_name: 'Smith',
            },
          }),
        },
      };

      const service = new ResumeService(
        mockPrisma,
        mockStudentService,
        mockStorageService,
        mockQueueService
      );

      const result = await service.getResumeFile('admin-user-1', 'ADMIN', 'resume-uuid-1');
      assert.ok(result.buffer);
      assert.equal(result.fileName, 'Alice_Smith_Resume.pdf');
    });
  });
});
