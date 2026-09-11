const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  RecruiterController,
} = require('../dist/modules/recruiter/recruiter.controller');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Recruiter Controller & Security Guards Test Suite', () => {
  describe('RolesGuard with RECRUITER Role', () => {
    const reflector = new Reflector();

    it('should reject users with STUDENT role when RECRUITER role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockRecruiterController {}
      Reflect.defineMetadata(ROLES_KEY, ['RECRUITER'], MockRecruiterController);

      const studentRequest = {
        user: { userId: 'user-student', role: 'STUDENT' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => studentRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockRecruiterController,
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

    it('should allow users with RECRUITER role when RECRUITER role is required', () => {
      const guard = new RolesGuard(reflector);

      const mockHandler = () => {};
      class MockRecruiterController {}
      Reflect.defineMetadata(ROLES_KEY, ['RECRUITER'], MockRecruiterController);

      const recruiterRequest = {
        user: { userId: 'user-recruiter', role: 'RECRUITER' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => recruiterRequest,
        }),
        getHandler: () => mockHandler,
        getClass: () => MockRecruiterController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });
  });

  describe('RecruiterController', () => {
    it('should have RECRUITER role metadata defined on the controller class', () => {
      const reflector = new Reflector();
      const roles = reflector.get(ROLES_KEY, RecruiterController);
      assert.deepEqual(roles, ['RECRUITER']);
    });

    it('should route getProfile to recruiterService and return 200 envelope', async () => {
      const mockProfileData = {
        id: 'recruiter-uuid-1',
        first_name: 'Sarah',
        last_name: 'Connor',
        is_approved: true,
        company: {
          id: 'company-uuid-1',
          name: 'TechNova Solutions',
          website: 'https://technova.example.com',
          logo_url: null,
        },
      };

      const mockService = {
        getProfileByUserId: async (userId) => {
          assert.equal(userId, 'recruiter-user-id');
          return mockProfileData;
        },
      };

      const controller = new RecruiterController(mockService);
      const response = await controller.getProfile('recruiter-user-id');

      assert.deepEqual(response, {
        success: true,
        data: mockProfileData,
      });
    });

    it('should route updateProfile to recruiterService and return 200 envelope', async () => {
      const updateDto = {
        first_name: 'Sarah Jane',
        last_name: 'Smith',
      };

      const mockUpdatedData = {
        id: 'recruiter-uuid-1',
        first_name: 'Sarah Jane',
        last_name: 'Smith',
        is_approved: true,
        company: {
          id: 'company-uuid-1',
          name: 'TechNova Solutions',
          website: 'https://technova.example.com',
          logo_url: null,
        },
      };

      const mockService = {
        updateProfileByUserId: async (userId, dto) => {
          assert.equal(userId, 'recruiter-user-id');
          assert.deepEqual(dto, updateDto);
          return mockUpdatedData;
        },
      };

      const controller = new RecruiterController(mockService);
      const response = await controller.updateProfile(
        'recruiter-user-id',
        updateDto
      );

      assert.deepEqual(response, {
        success: true,
        data: mockUpdatedData,
      });
    });
  });
});
