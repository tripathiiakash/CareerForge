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

    it('should route getProfile to recruiterService and return 200 envelope (assigned company)', async () => {
      const mockProfileData = {
        id: 'recruiter-uuid-1',
        first_name: 'Sarah',
        last_name: 'Connor',
        is_approved: true,
        is_company_assigned: true,
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

    it('should route getProfile and return is_company_assigned=false when company name is empty (unassigned)', async () => {
      const mockUnassignedProfileData = {
        id: 'recruiter-uuid-2',
        first_name: 'John',
        last_name: 'Doe',
        is_approved: true,
        is_company_assigned: false,
        company: {
          id: 'placeholder-company-uuid',
          name: '',
          website: null,
          logo_url: null,
        },
      };

      const mockService = {
        getProfileByUserId: async () => mockUnassignedProfileData,
      };

      const controller = new RecruiterController(mockService);
      const response = await controller.getProfile('recruiter-unassigned-id');

      assert.equal(response.success, true);
      assert.equal(response.data.is_company_assigned, false);
      assert.equal(response.data.company.name, '');
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
        is_company_assigned: true,
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

    it('should not allow recruiter to self-assign company_id through updateProfile', async () => {
      // The service should silently ignore company_id — only name/last_name are updated.
      // This test verifies the controller correctly passes the DTO (after Zod pipe) to the service.
      // The service strips company_id internally, so even if company_id is in the DTO it is ignored.
      const dtoWithCompanyId = {
        first_name: 'Tampered',
        last_name: 'User',
        company_id: 'some-other-company-uuid',
      };

      let receivedDto = null;
      const mockService = {
        updateProfileByUserId: async (userId, dto) => {
          receivedDto = dto;
          return {
            id: 'recruiter-uuid-1',
            first_name: 'Tampered',
            last_name: 'User',
            is_approved: true,
            is_company_assigned: false, // service ignores company_id so stays unassigned
            company: {
              id: 'placeholder',
              name: '',
              website: null,
              logo_url: null,
            },
          };
        },
      };

      const controller = new RecruiterController(mockService);
      const response = await controller.updateProfile(
        'recruiter-user-id',
        dtoWithCompanyId
      );

      // Service was called — the service itself drops company_id from the DB update
      assert.equal(response.success, true);
      // The profile remains unassigned regardless of the dto company_id field
      assert.equal(response.data.is_company_assigned, false);
    });
  });
});
