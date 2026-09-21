const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const {
  RecruiterJobController,
} = require('../dist/modules/job/recruiter-job.controller');
const { JobService } = require('../dist/modules/job/job.service');
const { ROLES_KEY } = require('../dist/core/decorators/roles.decorator');

describe('Recruiter Jobs Endpoint Test Suite (GET /api/v1/recruiters/me/jobs)', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validRecruiterId = '22222222-2222-4222-8222-222222222222';
  const otherUserId = '33333333-3333-4333-8333-333333333333';
  const otherRecruiterId = '44444444-4444-4444-8444-444444444444';
  const validCompanyId = '55555555-5555-4555-8555-555555555555';

  const mockCompany = {
    id: validCompanyId,
    name: 'TechNova Solutions',
    website: 'https://technova.example.com',
    logo_url: 'https://technova.example.com/logo.png',
  };

  let mockPrisma;
  let mockRecruiterService;
  let service;

  beforeEach(() => {
    mockRecruiterService = {
      getProfileByUserId: async (userId) => {
        if (userId === validUserId) {
          return {
            id: validRecruiterId,
            user_id: validUserId,
            company_id: validCompanyId,
            first_name: 'Sarah',
            last_name: 'Connor',
            is_approved: true,
            company: mockCompany,
          };
        }
        if (userId === otherUserId) {
          return {
            id: otherRecruiterId,
            user_id: otherUserId,
            company_id: validCompanyId,
            first_name: 'John',
            last_name: 'Doe',
            is_approved: true,
            company: mockCompany,
          };
        }
        const { NotFoundException } = require('@nestjs/common');
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Recruiter profile does not exist',
        });
      },
    };

    mockPrisma = {
      job: {
        findMany: async ({ where, orderBy }) => {
          assert.equal(orderBy?.created_at, 'desc');
          if (where.recruiter_id === validRecruiterId) {
            return [
              {
                id: 'job-uuid-1',
                title: 'Senior Backend Engineer',
                description: 'Build high-scale distributed systems with Node.js and PostgreSQL...',
                required_skills: ['Node.js', 'PostgreSQL', 'Docker'],
                employment_type: 'FULL_TIME',
                status: 'ACTIVE',
                created_at: new Date('2026-03-01T12:00:00.000Z'),
                company: mockCompany,
              },
              {
                id: 'job-uuid-2',
                title: 'Frontend Engineering Intern',
                description: 'Work with modern React, TypeScript, and Tailwind CSS components...',
                required_skills: ['React', 'TypeScript'],
                employment_type: 'INTERNSHIP',
                status: 'PENDING',
                created_at: new Date('2026-02-28T10:00:00.000Z'),
                company: mockCompany,
              },
              {
                id: 'job-uuid-3',
                title: 'DevOps Engineer',
                description: 'Manage Kubernetes clusters and CI/CD deployment pipelines...',
                required_skills: ['Kubernetes', 'AWS', 'Terraform'],
                employment_type: 'FULL_TIME',
                status: 'REJECTED',
                created_at: new Date('2026-02-20T08:00:00.000Z'),
                company: mockCompany,
              },
            ];
          }
          if (where.recruiter_id === otherRecruiterId) {
            return [
              {
                id: 'other-job-999',
                title: 'Other Recruiter Job',
                description: 'Job posted by a completely different recruiter...',
                required_skills: ['Java'],
                employment_type: 'FULL_TIME',
                status: 'ACTIVE',
                created_at: new Date('2026-01-01T00:00:00.000Z'),
                company: mockCompany,
              },
            ];
          }
          return [];
        },
      },
    };

    const mockAppService = {};
    service = new JobService(mockPrisma, mockRecruiterService, mockAppService);
  });

  describe('JobService.getJobsByRecruiterUserId', () => {
    it('1. returns all jobs owned by authenticated recruiter with real statuses', async () => {
      const jobs = await service.getJobsByRecruiterUserId(validUserId);

      assert.equal(jobs.length, 3);

      assert.equal(jobs[0].id, 'job-uuid-1');
      assert.equal(jobs[0].title, 'Senior Backend Engineer');
      assert.equal(jobs[0].status, 'ACTIVE');
      assert.equal(jobs[0].employment_type, 'FULL_TIME');
      assert.deepEqual(jobs[0].company, mockCompany);

      assert.equal(jobs[1].id, 'job-uuid-2');
      assert.equal(jobs[1].title, 'Frontend Engineering Intern');
      assert.equal(jobs[1].status, 'PENDING');
      assert.equal(jobs[1].employment_type, 'INTERNSHIP');

      assert.equal(jobs[2].id, 'job-uuid-3');
      assert.equal(jobs[2].title, 'DevOps Engineer');
      assert.equal(jobs[2].status, 'REJECTED');
      assert.equal(jobs[2].employment_type, 'FULL_TIME');
    });

    it('2. strictly isolates recruiter jobs (does not see another recruiter jobs)', async () => {
      const jobs = await service.getJobsByRecruiterUserId(validUserId);
      const containsOther = jobs.some((j) => j.id === 'other-job-999');
      assert.equal(containsOther, false);
    });

    it('3. does not expose recruiter_id, user_id, or internal database fields', async () => {
      const jobs = await service.getJobsByRecruiterUserId(validUserId);
      for (const job of jobs) {
        assert.equal(job.recruiter_id, undefined);
        assert.equal(job.user_id, undefined);
        assert.equal(job.updated_at, undefined);
      }
    });

    it('4. throws 404 NOT_FOUND when recruiter profile does not exist', async () => {
      await assert.rejects(
        () => service.getJobsByRecruiterUserId('non-existent-user-id'),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('5. returns empty array when recruiter has no posted jobs', async () => {
      mockPrisma.job.findMany = async () => [];
      const jobs = await service.getJobsByRecruiterUserId(validUserId);
      assert.deepEqual(jobs, []);
    });
  });

  describe('RecruiterJobController Routing & Security Guards', () => {
    const reflector = new Reflector();

    it('1. verifies controller has class-level RECRUITER role requirement', () => {
      const roles = reflector.get(ROLES_KEY, RecruiterJobController);
      assert.deepEqual(roles, ['RECRUITER']);
    });

    it('2. rejects STUDENT role with 403 FORBIDDEN via RolesGuard', () => {
      const guard = new RolesGuard(reflector);
      const studentRequest = {
        user: { userId: 'student-id', role: 'STUDENT' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => studentRequest,
        }),
        getHandler: () => () => {},
        getClass: () => RecruiterJobController,
      };

      assert.throws(
        () => guard.canActivate(mockContext),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message.includes('Insufficient role permissions')
      );
    });

    it('3. rejects ADMIN role with 403 FORBIDDEN via RolesGuard', () => {
      const guard = new RolesGuard(reflector);
      const adminRequest = {
        user: { userId: 'admin-id', role: 'ADMIN' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => adminRequest,
        }),
        getHandler: () => () => {},
        getClass: () => RecruiterJobController,
      };

      assert.throws(
        () => guard.canActivate(mockContext),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message.includes('Insufficient role permissions')
      );
    });

    it('4. allows RECRUITER role through RolesGuard', () => {
      const guard = new RolesGuard(reflector);
      const recruiterRequest = {
        user: { userId: validUserId, role: 'RECRUITER' },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => recruiterRequest,
        }),
        getHandler: () => () => {},
        getClass: () => RecruiterJobController,
      };

      const allowed = guard.canActivate(mockContext);
      assert.equal(allowed, true);
    });

    it('5. controller returns 200 envelope with { success: true, data }', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          title: 'Staff Engineer',
          description: 'Lead engineering initiatives...',
          required_skills: ['TypeScript', 'Architecture'],
          employment_type: 'FULL_TIME',
          status: 'ACTIVE',
          company: mockCompany,
          created_at: new Date('2026-03-01T00:00:00.000Z'),
        },
      ];

      const mockService = {
        getJobsByRecruiterUserId: async (userId) => {
          assert.equal(userId, validUserId);
          return mockJobs;
        },
      };

      const controller = new RecruiterJobController(mockService);
      const response = await controller.getMyJobs(validUserId);

      assert.deepEqual(response, {
        success: true,
        data: mockJobs,
      });
    });
  });
});
