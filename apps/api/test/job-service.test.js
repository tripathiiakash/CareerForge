const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JobService } = require('../dist/modules/job/job.service');

describe('JobService Test Suite (Phase 4.3.1 - docs/API.md §5.1)', () => {
  let service;
  let mockPrisma;

  const validUserId = 'user-uuid-1111-2222-3333-444444444444';
  const validRecruiterId = 'recruiter-uuid-5555-6666-7777-888888888888';
  const validCompanyId = 'company-uuid-9999-aaaa-bbbb-cccccccccccc';
  const validJobId = 'job-uuid-dddd-eeee-ffff-000000000000';

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
      },
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
});
