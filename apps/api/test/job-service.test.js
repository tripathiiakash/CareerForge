const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JobService } = require('../dist/modules/job/job.service');

describe('JobService Test Suite (Phase 4.3.1 - docs/API.md §5.1)', () => {
  let service;
  let mockPrisma;

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validRecruiterId = '22222222-2222-4222-8222-222222222222';
  const validCompanyId = '33333333-3333-4333-8333-333333333333';
  const validJobId = '44444444-4444-4444-8444-444444444444';

  const validRecruiterRecord = {
    id: validRecruiterId,
    user_id: validUserId,
    company_id: validCompanyId,
    first_name: 'Sarah',
    last_name: 'Connor',
    is_approved: true,
    company: {
      id: validCompanyId,
      name: 'TechNova Solutions',
      website: 'https://technova.example.com',
      logo_url: null,
    },
  };

  const validJobDto = {
    title: 'Junior Backend Developer',
    description:
      'We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...',
    required_skills: ['Node.js', 'PostgreSQL', 'REST APIs'],
    employment_type: 'FULL_TIME',
  };

  const otherRecruiterId = '55555555-5555-4555-8555-555555555555';

  const validExistingJob = {
    id: validJobId,
    recruiter_id: validRecruiterId,
    company_id: validCompanyId,
    title: 'Junior Backend Developer',
    description:
      'We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...',
    required_skills: ['Node.js', 'PostgreSQL', 'REST APIs'],
    employment_type: 'FULL_TIME',
    status: 'ACTIVE',
    created_at: new Date('2024-02-05T12:00:00.000Z'),
    updated_at: new Date('2024-02-05T12:00:00.000Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      recruiter: {
        findUnique: async () => validRecruiterRecord,
      },
      job: {
        create: async (args) => ({
          id: validJobId,
          status: 'PENDING',
        }),
        findUnique: async () => ({ ...validExistingJob }),
        update: async (args) => ({
          id: validJobId,
          title: args.data.title || validExistingJob.title,
          status: validExistingJob.status,
        }),
        delete: async () => ({
          id: validJobId,
        }),
      },
      application: {
        deleteMany: async () => ({ count: 1 }),
      },
      $transaction: async (cb) => cb(mockPrisma),
    };

    service = new JobService(mockPrisma);
  });

  describe('createJob', () => {
    it('1. successful job creation with valid fields and PENDING status', async () => {
      let passedArgs = null;
      mockPrisma.job.create = async (args) => {
        passedArgs = args;
        return {
          id: validJobId,
          status: 'PENDING',
        };
      };

      const result = await service.createJob(validUserId, validJobDto);

      assert.equal(result.id, validJobId);
      assert.equal(result.status, 'PENDING');
      assert.equal(result.message, 'Job created and pending admin approval.');

      assert.equal(passedArgs.data.recruiter_id, validRecruiterId);
      assert.equal(passedArgs.data.company_id, validCompanyId);
      assert.equal(passedArgs.data.title, 'Junior Backend Developer');
      assert.equal(passedArgs.data.status, 'PENDING');
      assert.equal(passedArgs.data.employment_type, 'FULL_TIME');
      assert.deepEqual(passedArgs.data.required_skills, [
        'Node.js',
        'PostgreSQL',
        'REST APIs',
      ]);
    });

    it('2. strict ownership binding: recruiter_id and company_id derived from DB, not client payload', async () => {
      let passedArgs = null;
      mockPrisma.job.create = async (args) => {
        passedArgs = args;
        return {
          id: validJobId,
          status: 'PENDING',
        };
      };

      const maliciousDto = {
        ...validJobDto,
        recruiter_id: 'attacker-recruiter-id',
        company_id: 'unrelated-company-id',
        user_id: 'attacker-user-id',
        status: 'ACTIVE', // attacker attempting to bypass pending approval
      };

      await service.createJob(validUserId, maliciousDto);

      assert.equal(passedArgs.data.recruiter_id, validRecruiterId);
      assert.equal(passedArgs.data.company_id, validCompanyId);
      assert.equal(passedArgs.data.status, 'PENDING');
      assert.equal(passedArgs.data.user_id, undefined);
    });

    it('3. rejects with 404 NOT_FOUND when recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () => service.createJob(validUserId, validJobDto),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('4. rejects with 400 VALIDATION_ERROR when recruiter has no linked company', async () => {
      // Recruiter with missing company_id
      mockPrisma.recruiter.findUnique = async () => ({
        ...validRecruiterRecord,
        company_id: null,
        company: null,
      });

      await assert.rejects(
        () => service.createJob(validUserId, validJobDto),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Recruiter has no linked company'
      );

      // Recruiter with empty dummy company (registration placeholder)
      mockPrisma.recruiter.findUnique = async () => ({
        ...validRecruiterRecord,
        company_id: 'dummy-company-id',
        company: {
          id: 'dummy-company-id',
          name: '   ',
        },
      });

      await assert.rejects(
        () => service.createJob(validUserId, validJobDto),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Recruiter has no linked company'
      );
    });

    it('5. sanitizes HTML and script injection from description to prevent stored XSS', async () => {
      let passedArgs = null;
      mockPrisma.job.create = async (args) => {
        passedArgs = args;
        return {
          id: validJobId,
          status: 'PENDING',
        };
      };

      const xssDto = {
        ...validJobDto,
        description:
          'We need a backend dev <script>alert("xss")</script><iframe src="evil.com"></iframe> who knows Node and SQL.' +
          ' Extra text to exceed minimum length required by schema validation.'.padEnd(
            50,
            '.'
          ),
      };

      await service.createJob(validUserId, xssDto);

      assert.equal(
        passedArgs.data.description.includes('<script>'),
        false,
        'Should not contain <script>'
      );
      assert.equal(
        passedArgs.data.description.includes('alert("xss")'),
        false,
        'Should strip script contents'
      );
      assert.equal(
        passedArgs.data.description.includes('<iframe'),
        false,
        'Should not contain <iframe>'
      );
    });

    it('6. response shape only exposes documented fields (id, status, message)', async () => {
      mockPrisma.job.create = async () => ({
        id: validJobId,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
        secret_internal: 'internal',
      });

      const result = await service.createJob(validUserId, validJobDto);

      assert.deepEqual(Object.keys(result).sort(), ['id', 'message', 'status']);
      assert.equal(result.created_at, undefined);
      assert.equal(result.updated_at, undefined);
      assert.equal(result.secret_internal, undefined);
    });

    it('7. propagates database errors cleanly', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.job.create = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.createJob(validUserId, validJobDto),
        (err) => err === dbError
      );
    });
  });

  describe('updateJob (Phase 4.3.2 - docs/API.md §5.4)', () => {
    const validUpdateDto = {
      title: 'Junior Backend Developer (Updated)',
      description:
        'We are looking for an updated Node.js developer with PostgreSQL experience.'.padEnd(
          60,
          '.'
        ),
      required_skills: ['Node.js', 'PostgreSQL', 'Docker'],
      employment_type: 'FULL_TIME',
    };

    it('1. successful full update with documented fields', async () => {
      let passedUpdateArgs = null;
      mockPrisma.job.update = async (args) => {
        passedUpdateArgs = args;
        return {
          id: validJobId,
          title: args.data.title,
          status: 'ACTIVE',
        };
      };

      const result = await service.updateJob(
        validUserId,
        validJobId,
        validUpdateDto
      );

      assert.equal(result.id, validJobId);
      assert.equal(result.title, 'Junior Backend Developer (Updated)');
      assert.equal(result.status, 'ACTIVE');
      assert.equal(result.message, 'Job updated successfully.');

      assert.equal(passedUpdateArgs.where.id, validJobId);
      assert.equal(
        passedUpdateArgs.data.title,
        'Junior Backend Developer (Updated)'
      );
      assert.deepEqual(passedUpdateArgs.data.required_skills, [
        'Node.js',
        'PostgreSQL',
        'Docker',
      ]);
      assert.equal(passedUpdateArgs.data.employment_type, 'FULL_TIME');
      assert.equal(passedUpdateArgs.data.status, undefined);
    });

    it('2. successful partial update (e.g. only title provided)', async () => {
      let passedUpdateArgs = null;
      mockPrisma.job.update = async (args) => {
        passedUpdateArgs = args;
        return {
          id: validJobId,
          title: args.data.title,
          status: 'ACTIVE',
        };
      };

      const result = await service.updateJob(validUserId, validJobId, {
        title: 'New Partial Title',
      });

      assert.equal(result.title, 'New Partial Title');
      assert.equal(passedUpdateArgs.data.title, 'New Partial Title');
      assert.equal(passedUpdateArgs.data.description, undefined);
      assert.equal(passedUpdateArgs.data.required_skills, undefined);
      assert.equal(passedUpdateArgs.data.employment_type, undefined);
    });

    it('3. rejects invalid UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () => service.updateJob(validUserId, 'not-a-valid-uuid', validUpdateDto),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Invalid jobId format (must be a valid UUID)'
      );
    });

    it('4. rejects with 404 NOT_FOUND when recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () => service.updateJob(validUserId, validJobId, validUpdateDto),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('5. rejects with 404 NOT_FOUND when job does not exist', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () => service.updateJob(validUserId, validJobId, validUpdateDto),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Job does not exist'
      );
    });

    it('6. rejects with 403 FORBIDDEN when job belongs to another recruiter (BOLA/IDOR protection)', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validExistingJob,
        recruiter_id: otherRecruiterId,
      });

      await assert.rejects(
        () => service.updateJob(validUserId, validJobId, validUpdateDto),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message === 'Recruiter does not own this job'
      );
    });

    it('7. sanitizes HTML and script injection from description on update', async () => {
      let passedUpdateArgs = null;
      mockPrisma.job.update = async (args) => {
        passedUpdateArgs = args;
        return {
          id: validJobId,
          title: validExistingJob.title,
          status: 'ACTIVE',
        };
      };

      const xssUpdateDto = {
        description:
          'Updated with <script>alert("xss")</script><iframe src="evil.com"></iframe> safe content.'.padEnd(
            60,
            '.'
          ),
      };

      await service.updateJob(validUserId, validJobId, xssUpdateDto);

      assert.equal(passedUpdateArgs.data.description.includes('<script>'), false);
      assert.equal(
        passedUpdateArgs.data.description.includes('alert("xss")'),
        false
      );
      assert.equal(passedUpdateArgs.data.description.includes('<iframe'), false);
    });

    it('8. preserves existing status and does not permit status alteration', async () => {
      let passedUpdateArgs = null;
      mockPrisma.job.findUnique = async () => ({
        ...validExistingJob,
        status: 'PENDING',
      });
      mockPrisma.job.update = async (args) => {
        passedUpdateArgs = args;
        return {
          id: validJobId,
          title: args.data.title || validExistingJob.title,
          status: 'PENDING',
        };
      };

      // Attacker attempts to pass status: ACTIVE in update payload
      const maliciousDto = {
        title: 'Updated Title',
        status: 'ACTIVE',
      };

      const result = await service.updateJob(
        validUserId,
        validJobId,
        maliciousDto
      );

      assert.equal(result.status, 'PENDING');
      assert.equal(passedUpdateArgs.data.status, undefined);
    });

    it('9. strictly excludes internal fields from update query (recruiter_id, company_id)', async () => {
      let passedUpdateArgs = null;
      mockPrisma.job.update = async (args) => {
        passedUpdateArgs = args;
        return {
          id: validJobId,
          title: 'Updated',
          status: 'ACTIVE',
        };
      };

      const maliciousDto = {
        title: 'Updated',
        recruiter_id: 'injected-recruiter-id',
        company_id: 'injected-company-id',
      };

      await service.updateJob(validUserId, validJobId, maliciousDto);

      assert.equal(passedUpdateArgs.data.recruiter_id, undefined);
      assert.equal(passedUpdateArgs.data.company_id, undefined);
    });

    it('10. response shape only exposes documented fields (id, title, status, message)', async () => {
      mockPrisma.job.update = async () => ({
        id: validJobId,
        title: 'Updated',
        status: 'ACTIVE',
        created_at: new Date(),
        updated_at: new Date(),
        secret_field: 'secret',
      });

      const result = await service.updateJob(validUserId, validJobId, {
        title: 'Updated',
      });

      assert.deepEqual(Object.keys(result).sort(), [
        'id',
        'message',
        'status',
        'title',
      ]);
      assert.equal(result.created_at, undefined);
      assert.equal(result.updated_at, undefined);
    });

    it('11. propagates database errors cleanly', async () => {
      const dbError = new Error('Database update failed');
      mockPrisma.job.update = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.updateJob(validUserId, validJobId, validUpdateDto),
        (err) => err === dbError
      );
    });
  });

  describe('deleteJob (Phase 4.3.2 - docs/API.md §5.5)', () => {
    it('1. successfully deletes owned job and returns documented response message', async () => {
      let deletedJobId = null;
      mockPrisma.job.delete = async (args) => {
        deletedJobId = args.where.id;
        return { id: validJobId };
      };

      const result = await service.deleteJob(validUserId, validJobId);

      assert.equal(result.message, 'Job deleted successfully.');
      assert.equal(deletedJobId, validJobId);
    });

    it('2. cleans up associated applications in a transaction to preserve relational integrity', async () => {
      let deletedAppJobId = null;
      let deletedJobId = null;

      mockPrisma.application.deleteMany = async (args) => {
        deletedAppJobId = args.where.job_id;
        return { count: 3 };
      };
      mockPrisma.job.delete = async (args) => {
        deletedJobId = args.where.id;
        return { id: validJobId };
      };

      await service.deleteJob(validUserId, validJobId);

      assert.equal(deletedAppJobId, validJobId);
      assert.equal(deletedJobId, validJobId);
    });

    it('3. rejects invalid UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () => service.deleteJob(validUserId, 'invalid-uuid-format'),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message === 'Invalid jobId format (must be a valid UUID)'
      );
    });

    it('4. rejects with 404 NOT_FOUND when recruiter profile does not exist', async () => {
      mockPrisma.recruiter.findUnique = async () => null;

      await assert.rejects(
        () => service.deleteJob(validUserId, validJobId),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Recruiter profile does not exist'
      );
    });

    it('5. rejects with 404 NOT_FOUND when job does not exist', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () => service.deleteJob(validUserId, validJobId),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Job does not exist'
      );
    });

    it('6. rejects with 403 FORBIDDEN when job belongs to another recruiter (BOLA/IDOR protection)', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validExistingJob,
        recruiter_id: otherRecruiterId,
      });

      await assert.rejects(
        () => service.deleteJob(validUserId, validJobId),
        (err) =>
          err.status === 403 &&
          err.response.code === 'FORBIDDEN' &&
          err.response.message === 'Recruiter does not own this job'
      );
    });

    it('7. allows deleting jobs regardless of status (PENDING or ACTIVE)', async () => {
      // PENDING status job
      mockPrisma.job.findUnique = async () => ({
        ...validExistingJob,
        status: 'PENDING',
      });
      const pendingResult = await service.deleteJob(validUserId, validJobId);
      assert.equal(pendingResult.message, 'Job deleted successfully.');

      // ACTIVE status job
      mockPrisma.job.findUnique = async () => ({
        ...validExistingJob,
        status: 'ACTIVE',
      });
      const activeResult = await service.deleteJob(validUserId, validJobId);
      assert.equal(activeResult.message, 'Job deleted successfully.');
    });

    it('8. propagates database errors cleanly', async () => {
      const dbError = new Error('Database delete failed');
      mockPrisma.job.delete = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.deleteJob(validUserId, validJobId),
        (err) => err === dbError
      );
    });
  });
});
