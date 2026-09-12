const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const {
  ApplicationService,
} = require('../dist/modules/application/application.service');

describe('ApplicationService Test Suite (Phase 4.4.1 - docs/API.md §8.1)', () => {
  let service;
  let mockPrisma;

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validStudentId = '22222222-2222-4222-8222-222222222222';
  const validJobId = '33333333-3333-4333-8333-333333333333';
  const validResumeId = '44444444-4444-4444-8444-444444444444';
  const validApplicationId = '55555555-5555-4555-8555-555555555555';
  const validRecruiterUserId = '66666666-6666-4666-8666-666666666666';
  const validRecruiterId = '77777777-7777-4777-8777-777777777777';

  beforeEach(() => {
    mockPrisma = {
      recruiter: {
        findUnique: async () => ({
          id: validRecruiterId,
          user_id: validRecruiterUserId,
        }),
      },
      student: {
        findUnique: async () => ({
          id: validStudentId,
          user_id: validUserId,
        }),
      },
      job: {
        findUnique: async () => ({
          id: validJobId,
          status: 'ACTIVE',
          recruiter_id: validRecruiterId,
        }),
      },
      resume: {
        findUnique: async () => ({
          id: validResumeId,
          student_id: validStudentId,
        }),
      },
      application: {
        findUnique: async () => null,
        count: async () => 0,
        findMany: async () => [],
        create: async ({ data }) => ({
          id: validApplicationId,
          job_id: data.job_id,
          student_id: data.student_id,
          resume_id: data.resume_id,
          status: data.status,
          applied_at: new Date('2024-02-10T14:30:00.000Z'),
        }),
        update: async ({ where, data }) => ({
          id: where.id,
          status: data.status,
          updated_at: new Date('2024-02-12T09:15:00.000Z'),
        }),
      },
    };

    service = new ApplicationService(mockPrisma);
  });

  describe('applyToJob', () => {
    it('1. successful application creation with APPLIED status and documented envelope', async () => {
      let createdData = null;
      mockPrisma.application.create = async ({ data }) => {
        createdData = data;
        return {
          id: validApplicationId,
          job_id: data.job_id,
          student_id: data.student_id,
          resume_id: data.resume_id,
          status: data.status,
          applied_at: new Date('2024-02-10T14:30:00.000Z'),
        };
      };

      const result = await service.applyToJob(validUserId, validJobId, {
        resume_id: validResumeId,
      });

      assert.equal(createdData.job_id, validJobId);
      assert.equal(createdData.student_id, validStudentId);
      assert.equal(createdData.resume_id, validResumeId);
      assert.equal(createdData.status, 'APPLIED');

      assert.deepEqual(result, {
        application_id: validApplicationId,
        status: 'APPLIED',
        applied_at: new Date('2024-02-10T14:30:00.000Z'),
        message: 'Successfully applied to the job.',
      });
    });

    it('2. rejects invalid jobId UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () =>
          service.applyToJob(validUserId, 'not-a-uuid', {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('jobId')
      );
    });

    it('3. rejects invalid resume_id UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: 'not-a-uuid',
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('resume_id')
      );
    });

    it('4. rejects with 404 NOT_FOUND when student profile does not exist', async () => {
      mockPrisma.student.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Student profile does not exist'
      );
    });

    it('5. rejects with 404 NOT_FOUND when job does not exist', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Job does not exist'
      );
    });

    it('6. rejects with 400 VALIDATION_ERROR when job is in PENDING status', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'PENDING',
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Job is not in ACTIVE status'
      );
    });

    it('7. rejects with 400 VALIDATION_ERROR when job is in REJECTED status', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'REJECTED',
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Job is not in ACTIVE status'
      );
    });

    it('8. rejects with 404 NOT_FOUND when resume does not exist', async () => {
      mockPrisma.resume.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Resume does not exist'
      );
    });

    it('9. rejects with 403 FORBIDDEN when resume belongs to another student (BOLA/IDOR protection)', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: validResumeId,
        student_id: '99999999-9999-4999-8999-999999999999', // Different student
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message ===
            'Resume does not belong to the authenticated student'
      );
    });

    it('10. rejects with 409 CONFLICT when student has already applied to the job (pre-check)', async () => {
      mockPrisma.application.findUnique = async () => ({
        id: 'existing-application-id',
        job_id: validJobId,
        student_id: validStudentId,
      });

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 409 &&
          err.response.code === 'CONFLICT' &&
          err.response.message === 'Student has already applied to this job'
      );
    });

    it('11. rejects with 409 CONFLICT when unique constraint (P2002) is triggered on race condition', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation on (job_id, student_id)',
        { code: 'P2002', clientVersion: '5.x' }
      );
      mockPrisma.application.create = async () => {
        throw p2002Error;
      };

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) =>
          err.status === 409 &&
          err.response.code === 'CONFLICT' &&
          err.response.message === 'Student has already applied to this job'
      );
    });

    it('12. security: student_id and status cannot be manipulated by client', async () => {
      let createdData = null;
      mockPrisma.application.create = async ({ data }) => {
        createdData = data;
        return {
          id: validApplicationId,
          job_id: data.job_id,
          student_id: data.student_id,
          resume_id: data.resume_id,
          status: data.status,
          applied_at: new Date(),
        };
      };

      await service.applyToJob(validUserId, validJobId, {
        resume_id: validResumeId,
        // Even if client tried to pass extra fields (which Zod blocks anyway):
        student_id: 'attacker-student-id',
        status: 'SHORTLISTED',
      });

      assert.equal(createdData.student_id, validStudentId);
      assert.equal(createdData.status, 'APPLIED');
    });

    it('13. propagates unexpected database errors cleanly', async () => {
      const dbError = new Error('Database query failure');
      mockPrisma.student.findUnique = async () => {
        throw dbError;
      };

      await assert.rejects(
        () =>
          service.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        (err) => err === dbError
      );
    });
  });

  describe('getStudentApplications (Phase 4.4.2 - docs/API.md §2.3)', () => {
    const mockDbApplications = [
      {
        id: 'app-1',
        student_id: validStudentId,
        resume_id: validResumeId,
        job_id: validJobId,
        status: 'SHORTLISTED',
        applied_at: new Date('2024-02-10T14:30:00.000Z'),
        updated_at: new Date('2024-02-12T09:15:00.000Z'),
        job: {
          id: validJobId,
          title: 'Junior Backend Developer',
          employment_type: 'FULL_TIME',
          recruiter_id: 'recruiter-999', // internal field
          company: {
            id: 'company-888',
            name: 'TechNova Solutions',
          },
        },
      },
    ];

    it('1. successful retrieval: returns student applications with default pagination and newest first', async () => {
      let capturedFindManyArgs = null;
      mockPrisma.application.count = async ({ where }) => {
        assert.equal(where.student_id, validStudentId);
        return 1;
      };

      mockPrisma.application.findMany = async (args) => {
        capturedFindManyArgs = args;
        return mockDbApplications;
      };

      const result = await service.getStudentApplications(validUserId, {});

      assert.equal(capturedFindManyArgs.where.student_id, validStudentId);
      assert.equal(capturedFindManyArgs.skip, 0);
      assert.equal(capturedFindManyArgs.take, 10);
      assert.deepEqual(capturedFindManyArgs.orderBy, { applied_at: 'desc' });

      assert.equal(result.meta.total, 1);
      assert.equal(result.meta.page, 1);
      assert.equal(result.meta.limit, 10);
      assert.equal(result.meta.totalPages, 1);
      assert.equal(result.data.length, 1);
    });

    it('2. ownership isolation: filters strictly by student_id and never returns another student applications', async () => {
      let capturedWhere = null;
      mockPrisma.application.count = async ({ where }) => {
        capturedWhere = where;
        return 0;
      };
      mockPrisma.application.findMany = async ({ where }) => {
        capturedWhere = where;
        return [];
      };

      await service.getStudentApplications(validUserId, {});

      assert.equal(capturedWhere.student_id, validStudentId);
    });

    it('3. status filter: correctly applies status filter when specified', async () => {
      let capturedWhere = null;
      mockPrisma.application.count = async ({ where }) => {
        capturedWhere = where;
        return 1;
      };
      mockPrisma.application.findMany = async ({ where }) => {
        capturedWhere = where;
        return mockDbApplications;
      };

      await service.getStudentApplications(validUserId, {
        status: 'SHORTLISTED',
      });

      assert.equal(capturedWhere.student_id, validStudentId);
      assert.equal(capturedWhere.status, 'SHORTLISTED');
    });

    it('4. custom pagination: skip, take, and totalPages calculated accurately', async () => {
      let capturedArgs = null;
      mockPrisma.application.count = async () => 25;
      mockPrisma.application.findMany = async (args) => {
        capturedArgs = args;
        return mockDbApplications;
      };

      const result = await service.getStudentApplications(validUserId, {
        page: 2,
        limit: 10,
      });

      assert.equal(capturedArgs.skip, 10);
      assert.equal(capturedArgs.take, 10);
      assert.equal(result.meta.total, 25);
      assert.equal(result.meta.page, 2);
      assert.equal(result.meta.limit, 10);
      assert.equal(result.meta.totalPages, 3);
    });

    it('5. empty result set: returns empty array with total=0 and totalPages=0 for student with no applications', async () => {
      mockPrisma.application.count = async () => 0;
      mockPrisma.application.findMany = async () => [];

      const result = await service.getStudentApplications(validUserId, {});

      assert.deepEqual(result.data, []);
      assert.equal(result.meta.total, 0);
      assert.equal(result.meta.totalPages, 0);
    });

    it('6. response shape: returns exact documented fields without internal data leakage', async () => {
      mockPrisma.application.count = async () => 1;
      mockPrisma.application.findMany = async () => mockDbApplications;

      const result = await service.getStudentApplications(validUserId, {});
      const item = result.data[0];

      assert.deepEqual(item, {
        application_id: 'app-1',
        status: 'SHORTLISTED',
        applied_at: new Date('2024-02-10T14:30:00.000Z'),
        updated_at: new Date('2024-02-12T09:15:00.000Z'),
        job: {
          id: validJobId,
          title: 'Junior Backend Developer',
          employment_type: 'FULL_TIME',
          company_name: 'TechNova Solutions',
        },
      });

      // Assert internal properties are omitted
      assert.equal(item.student_id, undefined);
      assert.equal(item.resume_id, undefined);
      assert.equal(item.job.recruiter_id, undefined);
    });

    it('7. rejects with 404 NOT_FOUND when student profile does not exist', async () => {
      mockPrisma.student.findUnique = async () => null;

      await assert.rejects(
        () => service.getStudentApplications(validUserId, {}),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Student profile does not exist'
      );
    });

    it('8. propagates database errors cleanly', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.application.findMany = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.getStudentApplications(validUserId, {}),
        (err) => err === dbError
      );
    });
  });

  describe('getJobApplicants (Phase 4.4.3 - docs/API.md §8.2)', () => {
    const mockApplicants = [
      {
        id: 'app-1',
        job_id: validJobId,
        student_id: validStudentId,
        resume_id: validResumeId,
        status: 'APPLIED',
        applied_at: new Date('2024-02-10T14:30:00.000Z'),
        student: {
          id: validStudentId,
          user_id: validUserId,
          first_name: 'Rahul',
          last_name: 'Sharma',
          university: 'State University',
          degree: 'B.Tech Computer Science',
          graduation_year: 2025,
          skills: ['React', 'Node.js', 'TypeScript'],
          github_url: 'https://github.com/rahul',
          linkedin_url: 'https://linkedin.com/in/rahul',
        },
        resume: {
          id: validResumeId,
          file_url: 'https://cloud-storage.com/resumes/rahul.pdf',
          parsed_text: 'SUPER SECRET PARSED TEXT THAT SHOULD NOT BE EXPOSED',
        },
      },
      {
        id: 'app-2',
        job_id: validJobId,
        student_id: 'student-2',
        resume_id: 'resume-2',
        status: 'SHORTLISTED',
        applied_at: new Date('2024-02-09T10:00:00.000Z'),
        student: {
          id: 'student-2',
          user_id: 'user-2',
          first_name: 'Priya',
          last_name: 'Patel',
          university: 'Tech Institute',
          degree: 'M.S. Software Engineering',
          graduation_year: 2024,
          skills: ['Python', 'PostgreSQL', 'Docker'],
          github_url: 'https://github.com/priya',
          linkedin_url: 'https://linkedin.com/in/priya',
        },
        resume: {
          id: 'resume-2',
          file_url: 'https://cloud-storage.com/resumes/priya.pdf',
          parsed_text: 'ANOTHER SECRET RESUME TEXT',
        },
      },
    ];

    it('1. rejects with 400 VALIDATION_ERROR when jobId is invalid UUID', async () => {
      await assert.rejects(
        () => service.getJobApplicants(validRecruiterUserId, 'not-a-uuid', {}),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Invalid jobId format (must be a valid UUID)'
      );
    });

    it('2. rejects with 404 NOT_FOUND when recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () => service.getJobApplicants(validRecruiterUserId, validJobId, {}),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('3. rejects with 404 NOT_FOUND when target job does not exist', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () => service.getJobApplicants(validRecruiterUserId, validJobId, {}),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Job does not exist'
      );
    });

    it('4. rejects with 403 FORBIDDEN when recruiter does not own the target job (BOLA/IDOR protection)', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'ACTIVE',
        recruiter_id: 'other-recruiter-id-999',
      });

      await assert.rejects(
        () => service.getJobApplicants(validRecruiterUserId, validJobId, {}),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message === 'Recruiter does not own this job'
      );
    });

    it('5. returns paginated applicant list with default pagination values (page=1, limit=10)', async () => {
      let capturedArgs = null;
      mockPrisma.application.count = async (args) => {
        capturedArgs = args;
        return 2;
      };
      mockPrisma.application.findMany = async (args) => {
        capturedArgs = { ...capturedArgs, ...args };
        return mockApplicants;
      };

      const result = await service.getJobApplicants(
        validRecruiterUserId,
        validJobId,
        {}
      );

      assert.equal(result.data.length, 2);
      assert.equal(result.meta.page, 1);
      assert.equal(result.meta.limit, 10);
      assert.equal(result.meta.total, 2);
      assert.equal(result.meta.totalPages, 1);

      assert.equal(capturedArgs.where.job_id, validJobId);
      assert.equal(capturedArgs.where.status, undefined);
      assert.equal(capturedArgs.skip, 0);
      assert.equal(capturedArgs.take, 10);
      assert.deepEqual(capturedArgs.orderBy, { applied_at: 'desc' });
    });

    it('6. applies status filter when status query parameter is provided', async () => {
      let capturedWhere = null;
      mockPrisma.application.count = async ({ where }) => {
        capturedWhere = where;
        return 1;
      };
      mockPrisma.application.findMany = async ({ where }) => {
        capturedWhere = where;
        return [mockApplicants[1]];
      };

      const result = await service.getJobApplicants(
        validRecruiterUserId,
        validJobId,
        { status: 'SHORTLISTED' }
      );

      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].status, 'SHORTLISTED');
      assert.equal(capturedWhere.job_id, validJobId);
      assert.equal(capturedWhere.status, 'SHORTLISTED');
    });

    it('7. respects custom pagination parameters and computes totalPages correctly', async () => {
      let capturedPagination = null;
      mockPrisma.application.count = async () => 14;
      mockPrisma.application.findMany = async ({ skip, take }) => {
        capturedPagination = { skip, take };
        return mockApplicants;
      };

      const result = await service.getJobApplicants(
        validRecruiterUserId,
        validJobId,
        { page: 2, limit: 5 }
      );

      assert.equal(result.meta.page, 2);
      assert.equal(result.meta.limit, 5);
      assert.equal(result.meta.total, 14);
      assert.equal(result.meta.totalPages, 3);
      assert.equal(capturedPagination.skip, 5);
      assert.equal(capturedPagination.take, 5);
    });

    it('8. returns empty applicant list with total: 0, totalPages: 0 when no applicants exist', async () => {
      mockPrisma.application.count = async () => 0;
      mockPrisma.application.findMany = async () => [];

      const result = await service.getJobApplicants(
        validRecruiterUserId,
        validJobId,
        {}
      );

      assert.deepEqual(result.data, []);
      assert.equal(result.meta.total, 0);
      assert.equal(result.meta.totalPages, 0);
    });

    it('9. preserves applicant privacy: does NOT leak student user_id, github_url, linkedin_url or resume parsed_text', async () => {
      mockPrisma.application.count = async () => 1;
      mockPrisma.application.findMany = async () => [mockApplicants[0]];

      const result = await service.getJobApplicants(
        validRecruiterUserId,
        validJobId,
        {}
      );

      const applicant = result.data[0];
      assert.equal(applicant.application_id, 'app-1');
      assert.equal(applicant.status, 'APPLIED');
      assert.deepEqual(applicant.student, {
        id: validStudentId,
        first_name: 'Rahul',
        last_name: 'Sharma',
        university: 'State University',
        degree: 'B.Tech Computer Science',
        graduation_year: 2025,
        skills: ['React', 'Node.js', 'TypeScript'],
      });
      assert.deepEqual(applicant.resume, {
        id: validResumeId,
        file_url: 'https://cloud-storage.com/resumes/rahul.pdf',
      });

      // Strict privacy assertions
      assert.equal(applicant.student.user_id, undefined);
      assert.equal(applicant.student.github_url, undefined);
      assert.equal(applicant.student.linkedin_url, undefined);
      assert.equal(applicant.resume.parsed_text, undefined);
      assert.equal(applicant.resume.student_id, undefined);
      assert.equal(applicant.job_id, undefined);
      assert.equal(applicant.student_id, undefined);
    });

    it('10. propagates database errors cleanly', async () => {
      const dbError = new Error('Database query failure');
      mockPrisma.application.findMany = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.getJobApplicants(validRecruiterUserId, validJobId, {}),
        (err) => err === dbError
      );
    });
  });

  describe('updateApplicationStatus (Phase 4.4.4 - docs/API.md §8.3)', () => {
    const validApplication = {
      id: validApplicationId,
      job_id: validJobId,
      student_id: validStudentId,
      resume_id: validResumeId,
      status: 'APPLIED',
      applied_at: new Date('2024-02-10T14:30:00.000Z'),
      updated_at: new Date('2024-02-10T14:30:00.000Z'),
      job: {
        id: validJobId,
        recruiter_id: validRecruiterId,
      },
    };

    it('1. rejects with 400 VALIDATION_ERROR when application id is invalid UUID', async () => {
      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            'invalid-uuid',
            { status: 'SHORTLISTED' }
          ),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Invalid id format (must be a valid UUID)'
      );
    });

    it('2. rejects with 404 NOT_FOUND when recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'SHORTLISTED' }
          ),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('3. rejects with 404 NOT_FOUND when application does not exist', async () => {
      mockPrisma.application.findUnique = async () => null;

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'SHORTLISTED' }
          ),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Application does not exist'
      );
    });

    it('4. rejects with 403 FORBIDDEN when recruiter does not own the parent job (BOLA/IDOR protection)', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        job: {
          id: validJobId,
          recruiter_id: 'different-recruiter-id-888',
        },
      });

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'SHORTLISTED' }
          ),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message === 'Recruiter does not own the parent job'
      );
    });

    it('5. successfully transitions application from APPLIED to SHORTLISTED', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'APPLIED',
      });

      let updatedArgs = null;
      mockPrisma.application.update = async (args) => {
        updatedArgs = args;
        return {
          id: validApplicationId,
          status: args.data.status,
          updated_at: new Date('2024-02-12T09:15:00.000Z'),
        };
      };

      const result = await service.updateApplicationStatus(
        validRecruiterUserId,
        validApplicationId,
        { status: 'SHORTLISTED' }
      );

      assert.equal(result.application_id, validApplicationId);
      assert.equal(result.status, 'SHORTLISTED');
      assert.ok(result.updated_at);
      assert.equal(updatedArgs.where.id, validApplicationId);
      assert.equal(updatedArgs.data.status, 'SHORTLISTED');
    });

    it('6. successfully transitions application from APPLIED to REJECTED', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'APPLIED',
      });

      mockPrisma.application.update = async ({ data }) => ({
        id: validApplicationId,
        status: data.status,
        updated_at: new Date('2024-02-12T09:15:00.000Z'),
      });

      const result = await service.updateApplicationStatus(
        validRecruiterUserId,
        validApplicationId,
        { status: 'REJECTED' }
      );

      assert.equal(result.application_id, validApplicationId);
      assert.equal(result.status, 'REJECTED');
    });

    it('7. successfully transitions application from SHORTLISTED to REJECTED', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'SHORTLISTED',
      });

      mockPrisma.application.update = async ({ data }) => ({
        id: validApplicationId,
        status: data.status,
        updated_at: new Date('2024-02-12T09:15:00.000Z'),
      });

      const result = await service.updateApplicationStatus(
        validRecruiterUserId,
        validApplicationId,
        { status: 'REJECTED' }
      );

      assert.equal(result.application_id, validApplicationId);
      assert.equal(result.status, 'REJECTED');
    });

    it('8. rejects invalid transition from SHORTLISTED to SHORTLISTED (no duplicate)', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'SHORTLISTED',
      });

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'SHORTLISTED' }
          ),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message ===
            'Cannot transition application status from SHORTLISTED to SHORTLISTED'
      );
    });

    it('9. rejects transition from REJECTED to SHORTLISTED (terminal state protection)', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'REJECTED',
      });

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'SHORTLISTED' }
          ),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message ===
            'Cannot transition application status from REJECTED to SHORTLISTED'
      );
    });

    it('10. rejects transition from REJECTED to REJECTED (terminal state protection)', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'REJECTED',
      });

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'REJECTED' }
          ),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message ===
            'Cannot transition application status from REJECTED to REJECTED'
      );
    });

    it('11. prevents tampering with student_id, job_id, resume_id, or applied_at', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'APPLIED',
      });

      let updatePayload = null;
      mockPrisma.application.update = async ({ data }) => {
        updatePayload = data;
        return {
          id: validApplicationId,
          status: data.status,
          updated_at: new Date('2024-02-12T09:15:00.000Z'),
        };
      };

      await service.updateApplicationStatus(
        validRecruiterUserId,
        validApplicationId,
        { status: 'SHORTLISTED' }
      );

      // Only status is modified
      assert.deepEqual(updatePayload, { status: 'SHORTLISTED' });
    });

    it('12. propagates database errors cleanly', async () => {
      mockPrisma.application.findUnique = async () => ({
        ...validApplication,
        status: 'APPLIED',
      });

      const dbError = new Error('Database write failure');
      mockPrisma.application.update = async () => {
        throw dbError;
      };

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            validRecruiterUserId,
            validApplicationId,
            { status: 'SHORTLISTED' }
          ),
        (err) => err === dbError
      );
    });
  });
});
