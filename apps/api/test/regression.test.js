const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  registerSchema,
  loginSchema,
  updateStudentProfileSchema,
  updateRecruiterProfileSchema,
  createCompanySchema,
  createJobSchema,
  updateJobSchema,
  listJobsQuerySchema,
  aiResumeAnalysisOutputSchema,
} = require('@careerforge/validation');
const { QUEUE_NAMES } = require('../dist/core/queue/queue.types');
const { validateEnvironment } = require('../dist/core/config/config.validator');

describe('Regression & Architecture Integrity Test Suite', () => {
  describe('Queue Names Integrity', () => {
    it('should maintain stable queue names for background processing', () => {
      assert.equal(
        QUEUE_NAMES.RESUME_TEXT_EXTRACTION,
        'resume-text-extraction'
      );
      assert.equal(QUEUE_NAMES.RESUME_AI_ANALYSIS, 'resume-ai-analysis');
    });
  });

  describe('Authentication Schemas', () => {
    it('should validate student registration correctly', () => {
      const validStudent = {
        email: 'Student@Example.COM',
        password: 'Password123!',
        role: 'STUDENT',
      };
      const parsed = registerSchema.parse(validStudent);
      assert.equal(parsed.email, 'student@example.com');
      assert.equal(parsed.role, 'STUDENT');
    });

    it('should validate recruiter registration correctly', () => {
      const validRecruiter = {
        email: 'recruiter@company.com',
        password: 'Password123!',
        role: 'RECRUITER',
      };
      const parsed = registerSchema.parse(validRecruiter);
      assert.equal(parsed.role, 'RECRUITER');
    });

    it('should reject invalid role or weak passwords', () => {
      assert.throws(
        () =>
          registerSchema.parse({
            email: 'admin@system.com',
            password: 'Password123!',
            role: 'ADMIN', // only STUDENT or RECRUITER can self-register
          }),
        (err) => err.name === 'ZodError'
      );

      assert.throws(
        () =>
          registerSchema.parse({
            email: 'user@example.com',
            password: 'weak',
            role: 'STUDENT',
          }),
        (err) => err.name === 'ZodError'
      );
    });

    it('should validate login credentials schema', () => {
      const parsed = loginSchema.parse({
        email: 'TEST@USER.COM',
        password: 'password123',
      });
      assert.equal(parsed.email, 'test@user.com');
    });
  });

  describe('Student Profile Validation', () => {
    it('should validate student profile updates and normalize skills', () => {
      const validProfile = {
        first_name: 'Jane',
        last_name: 'Doe',
        university: 'Stanford University',
        graduation_year: 2026,
        degree: 'B.S. Computer Science',
        skills: ['JavaScript', 'TypeScript', 'React', 'typescript'], // duplicates & mixed case
        github_url: 'https://github.com/janedoe',
        linkedin_url: 'https://linkedin.com/in/janedoe',
      };

      const parsed = updateStudentProfileSchema.parse(validProfile);
      assert.equal(parsed.first_name, 'Jane');
      assert.equal(parsed.graduation_year, 2026);
      // Skills should be deduplicated and lowercased
      assert.deepEqual(parsed.skills, ['javascript', 'typescript', 'react']);
    });

    it('should reject out-of-range graduation years or excessive skills', () => {
      assert.throws(
        () =>
          updateStudentProfileSchema.parse({
            graduation_year: 1990, // below 2000
          }),
        (err) => err.name === 'ZodError'
      );

      assert.throws(
        () =>
          updateStudentProfileSchema.parse({
            skills: Array.from({ length: 35 }, (_, i) => `skill-${i}`), // max 30
          }),
        (err) => err.name === 'ZodError'
      );
    });
  });

  describe('Recruiter Profile Validation', () => {
    it('should validate recruiter profile updates correctly', () => {
      const validProfile = {
        first_name: 'Sarah',
        last_name: 'Connor',
        company_id: '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47',
      };

      const parsed = updateRecruiterProfileSchema.parse(validProfile);
      assert.equal(parsed.first_name, 'Sarah');
      assert.equal(parsed.last_name, 'Connor');
      assert.equal(parsed.company_id, '1d8b67b1-419b-43d8-a53c-ebc4d32fbb47');

      // Empty object is valid (all fields optional)
      const emptyParsed = updateRecruiterProfileSchema.parse({});
      assert.deepEqual(emptyParsed, {});
    });

    it('should reject invalid company_id or empty names', () => {
      assert.throws(
        () =>
          updateRecruiterProfileSchema.parse({
            company_id: 'not-a-valid-uuid',
          }),
        (err) => err.name === 'ZodError'
      );

      assert.throws(
        () =>
          updateRecruiterProfileSchema.parse({
            first_name: '   ', // empty after trim
          }),
        (err) => err.name === 'ZodError'
      );
    });
  });

  describe('Company Creation Validation', () => {
    it('should validate company creation schema adhering to docs/API.md §3.1', () => {
      const valid = {
        name: 'TechNova Solutions',
        website: 'https://technova.example.com',
        logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
      };
      const parsed = createCompanySchema.parse(valid);
      assert.equal(parsed.name, 'TechNova Solutions');

      assert.throws(
        () => createCompanySchema.parse({ name: 'A' }),
        (err) => err.name === 'ZodError'
      );
    });

    it('should correctly expose Company module components', () => {
      const {
        CompanyModule,
      } = require('../dist/modules/company/company.module');
      const {
        CompanyController,
      } = require('../dist/modules/company/company.controller');
      const {
        CompanyService,
      } = require('../dist/modules/company/company.service');

      assert.ok(CompanyModule);
      assert.ok(CompanyController);
      assert.ok(CompanyService);
    });
  });

  describe('Job Creation Validation', () => {
    it('should validate job creation schema adhering to docs/API.md §5.1', () => {
      const valid = {
        title: 'Junior Backend Developer',
        description:
          'We are looking for a Node.js developer with experience in building REST APIs and working with PostgreSQL databases...',
        required_skills: ['Node.js', 'PostgreSQL'],
        employment_type: 'FULL_TIME',
      };
      const parsed = createJobSchema.parse(valid);
      assert.equal(parsed.title, 'Junior Backend Developer');
      assert.equal(parsed.employment_type, 'FULL_TIME');

      assert.throws(
        () => createJobSchema.parse({ ...valid, title: 'AB' }),
        (err) => err.name === 'ZodError'
      );
    });

    it('should validate job update schema adhering to docs/API.md §5.4', () => {
      const validUpdate = {
        title: 'Junior Backend Developer (Updated)',
        required_skills: ['Node.js', 'PostgreSQL', 'Docker'],
      };
      const parsed = updateJobSchema.parse(validUpdate);
      assert.equal(parsed.title, 'Junior Backend Developer (Updated)');
      assert.deepEqual(parsed.required_skills, [
        'Node.js',
        'PostgreSQL',
        'Docker',
      ]);

      assert.throws(
        () => updateJobSchema.parse({}),
        (err) => err.name === 'ZodError'
      );
    });

    it('should validate job list/search query schema adhering to docs/API.md §5.2', () => {
      const defaultParsed = listJobsQuerySchema.parse({});
      assert.equal(defaultParsed.page, 1);
      assert.equal(defaultParsed.limit, 10);

      const customParsed = listJobsQuerySchema.parse({
        page: '2',
        limit: '20',
        search: 'backend',
        skills: 'react,node.js',
        employment_type: 'FULL_TIME',
      });
      assert.equal(customParsed.page, 2);
      assert.equal(customParsed.limit, 20);
      assert.equal(customParsed.search, 'backend');
      assert.equal(customParsed.skills, 'react,node.js');
      assert.equal(customParsed.employment_type, 'FULL_TIME');

      assert.throws(
        () => listJobsQuerySchema.parse({ limit: 100 }),
        (err) => err.name === 'ZodError'
      );
    });

    it('should correctly expose Job module components', () => {
      const { JobModule } = require('../dist/modules/job/job.module');
      const { JobController } = require('../dist/modules/job/job.controller');
      const { JobService } = require('../dist/modules/job/job.service');

      assert.ok(JobModule);
      assert.ok(JobController);
      assert.ok(JobService);
    });
  });

  describe('AI Output Validation Bounds', () => {
    it('should enforce strict schema constraints on AI analysis outputs', () => {
      const validOutput = {
        score: 80,
        missing_skills: ['GraphQL', 'Docker'],
        formatting_tips: ['Use action verbs'],
      };
      const parsed = aiResumeAnalysisOutputSchema.parse(validOutput);
      assert.equal(parsed.score, 80);

      // Score < 0 rejected
      assert.throws(
        () =>
          aiResumeAnalysisOutputSchema.parse({
            ...validOutput,
            score: -5,
          }),
        (err) => err.name === 'ZodError'
      );

      // Score > 100 rejected
      assert.throws(
        () =>
          aiResumeAnalysisOutputSchema.parse({
            ...validOutput,
            score: 105,
          }),
        (err) => err.name === 'ZodError'
      );

      // Non-integer score rejected
      assert.throws(
        () =>
          aiResumeAnalysisOutputSchema.parse({
            ...validOutput,
            score: 82.5,
          }),
        (err) => err.name === 'ZodError'
      );
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should validate valid environment configuration', () => {
      const validEnv = {
        NODE_ENV: 'test',
        PORT: '5001',
        CORS_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        PG_BOSS_SCHEMA: 'pgboss',
        JWT_SECRET: 'a-very-secure-secret-key-at-least-32-characters-long',
        JWT_EXPIRES_IN: '1d',
      };

      const config = validateEnvironment(validEnv);
      assert.equal(config.nodeEnv, 'test');
      assert.equal(config.port, 5001);
      assert.equal(config.pgBossSchema, 'pgboss');
    });

    it('should throw ConfigValidationError on missing DATABASE_URL', () => {
      const invalidEnv = {
        NODE_ENV: 'test',
        PORT: '5001',
      };

      assert.throws(
        () => validateEnvironment(invalidEnv),
        (err) => err.name === 'ConfigValidationError'
      );
    });
  });
});
