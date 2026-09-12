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
        count: async () => 1,
        findMany: async () => [
          {
            id: validJobId,
            title: validExistingJob.title,
            required_skills: validExistingJob.required_skills,
            employment_type: validExistingJob.employment_type,
            created_at: validExistingJob.created_at,
            company: {
              id: validCompanyId,
              name: validRecruiterRecord.company.name,
              logo_url: validRecruiterRecord.company.logo_url,
            },
          },
        ],
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

  describe('listJobs (Phase 4.3.3 - docs/API.md §5.2)', () => {
    it('1. successful job listing with default pagination (page=1, limit=10, newest first)', async () => {
      let passedFindManyArgs = null;
      let passedCountArgs = null;

      mockPrisma.job.count = async (args) => {
        passedCountArgs = args;
        return 45;
      };

      mockPrisma.job.findMany = async (args) => {
        passedFindManyArgs = args;
        return [
          {
            id: validJobId,
            title: 'Junior Backend Developer',
            required_skills: ['Node.js', 'PostgreSQL'],
            employment_type: 'FULL_TIME',
            created_at: new Date('2024-02-05T12:00:00.000Z'),
            company: {
              id: validCompanyId,
              name: 'TechNova Solutions',
              logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
            },
          },
        ];
      };

      const result = await service.listJobs({});

      assert.equal(result.meta.page, 1);
      assert.equal(result.meta.limit, 10);
      assert.equal(result.meta.total, 45);
      assert.equal(result.meta.totalPages, 5);

      assert.equal(passedFindManyArgs.skip, 0);
      assert.equal(passedFindManyArgs.take, 10);
      assert.deepEqual(passedFindManyArgs.orderBy, { created_at: 'desc' });
      assert.equal(passedFindManyArgs.where.status, 'ACTIVE');
      assert.equal(passedCountArgs.where.status, 'ACTIVE');

      assert.equal(result.data.length, 1);
      assert.equal(result.data[0].id, validJobId);
      assert.equal(result.data[0].title, 'Junior Backend Developer');
      assert.equal(result.data[0].company.id, validCompanyId);
      assert.equal(result.data[0].company.name, 'TechNova Solutions');
      assert.equal(
        result.data[0].company.logo_url,
        'https://s3.amazonaws.com/bucket/logo.png'
      );
    });

    it('2. strict status constraint: where.status is always ACTIVE (pending and rejected jobs never exposed)', async () => {
      let capturedWhere = null;
      mockPrisma.job.findMany = async (args) => {
        capturedWhere = args.where;
        return [];
      };

      await service.listJobs({ page: 1, limit: 10 });
      assert.equal(capturedWhere.status, 'ACTIVE');
    });

    it('3. search filter: case-insensitive search across title and description', async () => {
      let capturedWhere = null;
      mockPrisma.job.findMany = async (args) => {
        capturedWhere = args.where;
        return [];
      };

      await service.listJobs({ search: 'developer' });

      assert.ok(capturedWhere.OR);
      assert.equal(capturedWhere.OR.length, 2);
      assert.deepEqual(capturedWhere.OR[0], {
        title: { contains: 'developer', mode: 'insensitive' },
      });
      assert.deepEqual(capturedWhere.OR[1], {
        description: { contains: 'developer', mode: 'insensitive' },
      });
    });

    it('4. skills filter: comma-separated string parsed to array overlap query (hasSome)', async () => {
      let capturedWhere = null;
      mockPrisma.job.findMany = async (args) => {
        capturedWhere = args.where;
        return [];
      };

      await service.listJobs({ skills: 'react, node.js' });

      assert.ok(capturedWhere.required_skills);
      assert.ok(capturedWhere.required_skills.hasSome);
      assert.ok(capturedWhere.required_skills.hasSome.includes('react'));
      assert.ok(capturedWhere.required_skills.hasSome.includes('node.js'));
    });

    it('5. employment_type filter: applies filter when specified', async () => {
      let capturedWhere = null;
      mockPrisma.job.findMany = async (args) => {
        capturedWhere = args.where;
        return [];
      };

      await service.listJobs({ employment_type: 'INTERNSHIP' });
      assert.equal(capturedWhere.employment_type, 'INTERNSHIP');

      await service.listJobs({ employment_type: 'FULL_TIME' });
      assert.equal(capturedWhere.employment_type, 'FULL_TIME');
    });

    it('6. custom pagination: skip, take, and totalPages calculated accurately', async () => {
      let capturedArgs = null;
      mockPrisma.job.count = async () => 23;
      mockPrisma.job.findMany = async (args) => {
        capturedArgs = args;
        return [];
      };

      const result = await service.listJobs({ page: 3, limit: 5 });

      assert.equal(capturedArgs.skip, 10); // (3 - 1) * 5
      assert.equal(capturedArgs.take, 5);
      assert.equal(result.meta.page, 3);
      assert.equal(result.meta.limit, 5);
      assert.equal(result.meta.total, 23);
      assert.equal(result.meta.totalPages, 5); // Math.ceil(23 / 5)
    });

    it('7. empty result set: returns empty array with total=0 and totalPages=0', async () => {
      mockPrisma.job.count = async () => 0;
      mockPrisma.job.findMany = async () => [];

      const result = await service.listJobs({ search: 'nonexistent-term' });

      assert.deepEqual(result.data, []);
      assert.equal(result.meta.total, 0);
      assert.equal(result.meta.totalPages, 0);
      assert.equal(result.meta.page, 1);
      assert.equal(result.meta.limit, 10);
    });

    it('8. response shape: returns only documented public fields without leaking internal keys', async () => {
      mockPrisma.job.count = async () => 1;
      mockPrisma.job.findMany = async () => [
        {
          id: validJobId,
          title: 'Junior Backend Developer',
          required_skills: ['Node.js'],
          employment_type: 'FULL_TIME',
          created_at: new Date('2024-02-05T12:00:00.000Z'),
          recruiter_id: validRecruiterId,
          updated_at: new Date(),
          description: 'Full secret description',
          company: {
            id: validCompanyId,
            name: 'TechNova Solutions',
            logo_url: null,
          },
        },
      ];

      const result = await service.listJobs({});
      const item = result.data[0];

      assert.deepEqual(Object.keys(item).sort(), [
        'company',
        'created_at',
        'employment_type',
        'id',
        'required_skills',
        'title',
      ]);
      assert.equal(item.recruiter_id, undefined);
      assert.equal(item.updated_at, undefined);
      assert.equal(item.description, undefined);
      assert.deepEqual(Object.keys(item.company).sort(), [
        'id',
        'logo_url',
        'name',
      ]);
    });

    it('9. propagates database errors cleanly', async () => {
      const dbError = new Error('Database query failed');
      mockPrisma.job.findMany = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.listJobs({}),
        (err) => err === dbError
      );
    });
  });

  describe('moderateJobStatus (Phase 4.3.4 - docs/API.md §9.2)', () => {
    const validJobId = '11111111-1111-4111-8111-111111111111';

    it('1. successful job approval: PENDING -> ACTIVE returns documented envelope and message', async () => {
      let updatePayload = null;
      mockPrisma.job.findUnique = async ({ where }) => {
        assert.equal(where.id, validJobId);
        return {
          id: validJobId,
          status: 'PENDING',
          recruiter_id: 'recruiter-123',
          company_id: 'company-456',
        };
      };

      mockPrisma.job.update = async ({ where, data, select }) => {
        assert.equal(where.id, validJobId);
        updatePayload = data;
        return {
          id: validJobId,
          status: data.status,
        };
      };

      const result = await service.moderateJobStatus(validJobId, {
        status: 'ACTIVE',
      });

      assert.equal(updatePayload.status, 'ACTIVE');
      assert.deepEqual(result, {
        id: validJobId,
        status: 'ACTIVE',
        message: 'Job approved and now visible to students.',
      });
    });

    it('2. successful job rejection: PENDING -> REJECTED returns documented envelope and message', async () => {
      let updatePayload = null;
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'PENDING',
      });

      mockPrisma.job.update = async ({ data }) => {
        updatePayload = data;
        return {
          id: validJobId,
          status: data.status,
        };
      };

      const result = await service.moderateJobStatus(validJobId, {
        status: 'REJECTED',
      });

      assert.equal(updatePayload.status, 'REJECTED');
      assert.deepEqual(result, {
        id: validJobId,
        status: 'REJECTED',
        message: 'Job rejected and hidden from students.',
      });
    });

    it('3. rejects invalid UUID with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () => service.moderateJobStatus('invalid-uuid', { status: 'ACTIVE' }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('UUID')
      );
    });

    it('4. rejects with 404 NOT_FOUND when job does not exist', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () => service.moderateJobStatus(validJobId, { status: 'ACTIVE' }),
        (err) =>
          err.status === 404 &&
          err.response.code === 'NOT_FOUND' &&
          err.response.message === 'Job does not exist'
      );
    });

    it('5. rejects with 400 VALIDATION_ERROR when job is already ACTIVE', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'ACTIVE',
      });

      await assert.rejects(
        () => service.moderateJobStatus(validJobId, { status: 'ACTIVE' }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('Only PENDING jobs')
      );

      await assert.rejects(
        () => service.moderateJobStatus(validJobId, { status: 'REJECTED' }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('Only PENDING jobs')
      );
    });

    it('6. rejects with 400 VALIDATION_ERROR when job is already REJECTED', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'REJECTED',
      });

      await assert.rejects(
        () => service.moderateJobStatus(validJobId, { status: 'ACTIVE' }),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('Only PENDING jobs')
      );
    });

    it('7. security: does not alter ownership fields or expose internal data', async () => {
      let capturedUpdateData = null;
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'PENDING',
        recruiter_id: 'immutable-recruiter-id',
        company_id: 'immutable-company-id',
      });

      mockPrisma.job.update = async ({ data }) => {
        capturedUpdateData = data;
        return {
          id: validJobId,
          status: data.status,
        };
      };

      const result = await service.moderateJobStatus(validJobId, {
        status: 'ACTIVE',
      });

      assert.deepEqual(Object.keys(capturedUpdateData), ['status']);
      assert.equal(capturedUpdateData.recruiter_id, undefined);
      assert.equal(capturedUpdateData.company_id, undefined);
      assert.equal(result.recruiter_id, undefined);
      assert.equal(result.company_id, undefined);
    });

    it('8. propagates database errors cleanly', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.job.findUnique = async () => {
        throw dbError;
      };

      await assert.rejects(
        () => service.moderateJobStatus(validJobId, { status: 'ACTIVE' }),
        (err) => err === dbError
      );
    });
  });

  describe('getJobById (docs/API.md §5.3)', () => {
    const validJobDetailFixture = {
      id: validJobId,
      recruiter_id: validRecruiterId,
      company_id: validCompanyId,
      title: 'Junior Backend Developer',
      description:
        'We are looking for a Node.js developer with experience in building REST APIs...',
      required_skills: ['Node.js', 'PostgreSQL', 'REST APIs'],
      employment_type: 'FULL_TIME',
      status: 'ACTIVE',
      created_at: new Date('2024-02-05T12:00:00.000Z'),
      company: {
        id: validCompanyId,
        name: 'TechNova Solutions',
        website: 'https://technova.example.com',
        logo_url: 'https://technova.example.com/logo.png',
      },
      recruiter: {
        user_id: validUserId,
      },
    };

    it('1. validation: throws 400 when jobId is not a valid UUID', async () => {
      await assert.rejects(
        () => service.getJobById('not-a-valid-uuid'),
        (err) =>
          err.status === 400 &&
          err.response.code === 'VALIDATION_ERROR' &&
          err.response.message.includes('valid UUID')
      );
    });

    it('2. not found: throws 404 when job does not exist in database', async () => {
      mockPrisma.job.findUnique = async () => null;

      await assert.rejects(
        () => service.getJobById(validJobId),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('3. public access: allows retrieving ACTIVE job without authentication', async () => {
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });

      const result = await service.getJobById(validJobId);

      assert.equal(result.id, validJobId);
      assert.equal(result.title, 'Junior Backend Developer');
      assert.equal(result.description, validJobDetailFixture.description);
      assert.deepEqual(result.required_skills, ['Node.js', 'PostgreSQL', 'REST APIs']);
      assert.equal(result.employment_type, 'FULL_TIME');
      assert.deepEqual(result.company, {
        id: validCompanyId,
        name: 'TechNova Solutions',
        website: 'https://technova.example.com',
        logo_url: 'https://technova.example.com/logo.png',
      });
      assert.equal(result.has_applied, undefined);
    });

    it('4. public access: throws 404 when unauthenticated user requests PENDING job', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'PENDING',
      });

      await assert.rejects(
        () => service.getJobById(validJobId),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('5. public access: throws 404 when unauthenticated user requests REJECTED job', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'REJECTED',
      });

      await assert.rejects(
        () => service.getJobById(validJobId),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('6. student access: returns has_applied: false when student has not applied', async () => {
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });
      mockPrisma.application = {
        findFirst: async () => null,
      };

      const studentUser = {
        userId: 'student-user-1111',
        email: 'student@example.com',
        role: 'STUDENT',
      };

      const result = await service.getJobById(validJobId, studentUser);

      assert.equal(result.id, validJobId);
      assert.equal(result.has_applied, false);
    });

    it('7. student access: returns has_applied: true when student has an existing application', async () => {
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });
      mockPrisma.application = {
        findFirst: async () => ({ id: 'app-uuid-9999' }),
      };

      const studentUser = {
        userId: 'student-user-1111',
        email: 'student@example.com',
        role: 'STUDENT',
      };

      const result = await service.getJobById(validJobId, studentUser);

      assert.equal(result.id, validJobId);
      assert.equal(result.has_applied, true);
    });

    it('8. student access: throws 404 when student attempts to access non-active job', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'PENDING',
      });

      const studentUser = {
        userId: 'student-user-1111',
        email: 'student@example.com',
        role: 'STUDENT',
      };

      await assert.rejects(
        () => service.getJobById(validJobId, studentUser),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('9. recruiter access: allows owning recruiter to access their own ACTIVE job', async () => {
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });

      const ownerUser = {
        userId: validUserId,
        email: 'sarah@example.com',
        role: 'RECRUITER',
      };

      const result = await service.getJobById(validJobId, ownerUser);
      assert.equal(result.id, validJobId);
      assert.equal(result.has_applied, undefined);
    });

    it('10. recruiter access: allows owning recruiter to access their own PENDING job', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'PENDING',
      });

      const ownerUser = {
        userId: validUserId,
        email: 'sarah@example.com',
        role: 'RECRUITER',
      };

      const result = await service.getJobById(validJobId, ownerUser);
      assert.equal(result.id, validJobId);
    });

    it('11. recruiter access: allows owning recruiter to access their own REJECTED job', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'REJECTED',
      });

      const ownerUser = {
        userId: validUserId,
        email: 'sarah@example.com',
        role: 'RECRUITER',
      };

      const result = await service.getJobById(validJobId, ownerUser);
      assert.equal(result.id, validJobId);
    });

    it('12. recruiter access: throws 404 when recruiter attempts to access another recruiter non-active job', async () => {
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'PENDING',
      });

      const otherRecruiterUser = {
        userId: 'other-user-9999',
        email: 'other@example.com',
        role: 'RECRUITER',
      };

      await assert.rejects(
        () => service.getJobById(validJobId, otherRecruiterUser),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('13. recruiter access: allows non-owning recruiter to access another recruiter ACTIVE job', async () => {
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });

      const otherRecruiterUser = {
        userId: 'other-user-9999',
        email: 'other@example.com',
        role: 'RECRUITER',
      };

      const result = await service.getJobById(validJobId, otherRecruiterUser);
      assert.equal(result.id, validJobId);
    });

    it('14. admin access: allows admin to access ACTIVE, PENDING, and REJECTED jobs', async () => {
      const adminUser = {
        userId: 'admin-user-0000',
        email: 'admin@example.com',
        role: 'ADMIN',
      };

      // ACTIVE
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });
      const activeResult = await service.getJobById(validJobId, adminUser);
      assert.equal(activeResult.id, validJobId);

      // PENDING
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'PENDING',
      });
      const pendingResult = await service.getJobById(validJobId, adminUser);
      assert.equal(pendingResult.id, validJobId);

      // REJECTED
      mockPrisma.job.findUnique = async () => ({
        ...validJobDetailFixture,
        status: 'REJECTED',
      });
      const rejectedResult = await service.getJobById(validJobId, adminUser);
      assert.equal(rejectedResult.id, validJobId);
    });

    it('15. security: response does not expose recruiter_id, recruiter object, or status', async () => {
      mockPrisma.job.findUnique = async () => ({ ...validJobDetailFixture });

      const result = await service.getJobById(validJobId);

      assert.equal(result.recruiter_id, undefined);
      assert.equal(result.recruiter, undefined);
      assert.equal(result.status, undefined);
      assert.equal(result.updated_at, undefined);
    });
  });
});
