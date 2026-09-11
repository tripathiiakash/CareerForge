const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  CompanyController,
} = require('../dist/modules/company/company.controller');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Company Controller & Security Guards Test Suite (docs/API.md §3.1)', () => {
  describe('RolesGuard with RECRUITER and ADMIN Roles', () => {
    const reflector = new Reflector();

    it('should reject users with STUDENT role when RECRUITER/ADMIN role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockCompanyController {}
      Reflect.defineMetadata(
        ROLES_KEY,
        ['RECRUITER', 'ADMIN'],
        MockCompanyController
      );

      const studentRequest = {
        user: { userId: 'user-student', role: 'STUDENT' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => studentRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockCompanyController,
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

    it('should reject requests with missing or unauthenticated user', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockCompanyController {}
      Reflect.defineMetadata(
        ROLES_KEY,
        ['RECRUITER', 'ADMIN'],
        MockCompanyController
      );

      const anonymousRequest = {};
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => anonymousRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockCompanyController,
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
      class MockCompanyController {}
      Reflect.defineMetadata(
        ROLES_KEY,
        ['RECRUITER', 'ADMIN'],
        MockCompanyController
      );

      const recruiterRequest = {
        user: { userId: 'user-recruiter', role: 'RECRUITER' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => recruiterRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockCompanyController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });

    it('should allow users with ADMIN role', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockCompanyController {}
      Reflect.defineMetadata(
        ROLES_KEY,
        ['RECRUITER', 'ADMIN'],
        MockCompanyController
      );

      const adminRequest = {
        user: { userId: 'user-admin', role: 'ADMIN' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => adminRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockCompanyController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });
  });

  describe('CompanyController', () => {
    it('should have RECRUITER and ADMIN roles metadata defined on the controller class', () => {
      const reflector = new Reflector();
      const roles = reflector.get(ROLES_KEY, CompanyController);
      assert.deepEqual(roles, ['RECRUITER', 'ADMIN']);
    });

    it('should route createCompany to companyService and return 201 Created envelope', async () => {
      const inputDto = {
        name: 'TechNova Solutions',
        website: 'https://technova.example.com',
        logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
      };

      const mockCompanyData = {
        id: '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47',
        name: 'TechNova Solutions',
        website: 'https://technova.example.com',
        logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
      };

      let capturedDto = null;
      const mockService = {
        createCompany: async (dto) => {
          capturedDto = dto;
          return mockCompanyData;
        },
      };

      const controller = new CompanyController(mockService);
      const response = await controller.createCompany(inputDto);

      assert.deepEqual(capturedDto, inputDto);
      assert.deepEqual(response, {
        success: true,
        data: mockCompanyData,
      });
    });

    it('should propagate service errors (such as 409 ConflictException) without swallowing', async () => {
      const mockConflictError = new Error('Company with this name already exists');
      mockConflictError.status = 409;

      const mockService = {
        createCompany: async () => {
          throw mockConflictError;
        },
      };

      const controller = new CompanyController(mockService);

      await assert.rejects(
        () => controller.createCompany({ name: 'Existing Corp' }),
        (err) => err === mockConflictError && err.status === 409
      );
    });
  });
});
