const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CompanyService } = require('../dist/modules/company/company.service');
const { ApplicationService } = require('../dist/modules/application/application.service');
const { JobService } = require('../dist/modules/job/job.service');
const { RecruiterService } = require('../dist/modules/recruiter/recruiter.service');
const { ResumeService } = require('../dist/modules/resume/resume.service');
const { InterviewPrepService } = require('../dist/modules/job/interview-prep.service');

describe('Phase 7 Modular Service Boundaries Hardening Suite', () => {
  const companyId = '11111111-1111-4111-8111-111111111111';
  const jobId = '22222222-2222-4222-8222-222222222222';
  const studentId = '33333333-3333-4333-8333-333333333333';
  const studentUserId = '44444444-4444-4444-8444-444444444444';
  const recruiterId = '55555555-5555-4555-8555-555555555555';
  const recruiterUserId = '66666666-6666-4666-8666-666666666666';
  const resumeId = '77777777-7777-4777-8777-777777777777';
  const applicationId = '88888888-8888-4888-8888-888888888888';

  describe('CompanyService.getCompanyById', () => {
    it('returns formatted CompanyData when company exists', async () => {
      const mockPrisma = {
        company: {
          findUnique: async ({ where }) => {
            if (where.id === companyId) {
              return {
                id: companyId,
                name: 'Acme Systems',
                website: 'https://acme.test',
                logo_url: 'https://acme.test/logo.png',
                created_at: new Date(),
              };
            }
            return null;
          },
        },
      };

      const companyService = new CompanyService(mockPrisma);
      const result = await companyService.getCompanyById(companyId);

      assert.deepEqual(result, {
        id: companyId,
        name: 'Acme Systems',
        website: 'https://acme.test',
        logo_url: 'https://acme.test/logo.png',
      });
      assert.equal('created_at' in result, false);
    });

    it('returns null when company does not exist', async () => {
      const mockPrisma = {
        company: {
          findUnique: async () => null,
        },
      };

      const companyService = new CompanyService(mockPrisma);
      const result = await companyService.getCompanyById('missing-id');
      assert.equal(result, null);
    });
  });

  describe('ApplicationService public query methods', () => {
    it('getApplicationByJobAndStudent returns id and status when found', async () => {
      const mockPrisma = {
        application: {
          findUnique: async ({ where }) => {
            if (
              where.job_id_student_id.job_id === jobId &&
              where.job_id_student_id.student_id === studentId
            ) {
              return {
                id: applicationId,
                status: 'APPLIED',
              };
            }
            return null;
          },
        },
      };

      const appService = new ApplicationService(mockPrisma);
      const app = await appService.getApplicationByJobAndStudent(jobId, studentId);

      assert.deepEqual(app, {
        id: applicationId,
        status: 'APPLIED',
      });
    });

    it('hasStudentAppliedToJob returns true when application exists, false otherwise', async () => {
      const mockPrisma = {
        application: {
          findFirst: async ({ where }) => {
            if (where.job_id === jobId && where.student?.user_id === studentUserId) {
              return { id: applicationId };
            }
            return null;
          },
        },
      };

      const appService = new ApplicationService(mockPrisma);

      const hasApplied = await appService.hasStudentAppliedToJob(jobId, studentUserId);
      assert.equal(hasApplied, true);

      const notApplied = await appService.hasStudentAppliedToJob(jobId, 'other-user');
      assert.equal(notApplied, false);
    });

    it('hasRecruiterAccessToResume returns true when recruiter owns a job applied to by resume', async () => {
      const mockPrisma = {
        application: {
          findFirst: async ({ where }) => {
            if (
              where.resume_id === resumeId &&
              where.job?.recruiter?.user_id === recruiterUserId
            ) {
              return { id: applicationId };
            }
            return null;
          },
        },
      };

      const appService = new ApplicationService(mockPrisma);

      const authorized = await appService.hasRecruiterAccessToResume(
        resumeId,
        recruiterUserId
      );
      assert.equal(authorized, true);

      const unauthorized = await appService.hasRecruiterAccessToResume(
        resumeId,
        'unrelated-recruiter'
      );
      assert.equal(unauthorized, false);
    });
  });

  describe('JobService boundary delegation', () => {
    it('listJobsByRecruiterId returns jobs scoped strictly to recruiterId', async () => {
      const mockJobs = [
        {
          id: jobId,
          title: 'Software Engineer',
          description: 'Build things',
          required_skills: ['TypeScript', 'Node.js'],
          employment_type: 'FULL_TIME',
          status: 'ACTIVE',
          created_at: new Date('2026-01-01'),
          company: {
            id: companyId,
            name: 'Acme',
            website: null,
            logo_url: null,
          },
        },
      ];

      const mockPrisma = {
        job: {
          findMany: async ({ where }) => {
            assert.equal(where.recruiter_id, recruiterId);
            return mockJobs;
          },
        },
      };

      const jobService = new JobService(mockPrisma, {}, {});
      const jobs = await jobService.listJobsByRecruiterId(recruiterId);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].title, 'Software Engineer');
    });

    it('getJobById delegates hasApplied check to ApplicationService', async () => {
      let delegatedCheck = false;
      const mockAppService = {
        hasStudentAppliedToJob: async (jId, uId) => {
          assert.equal(jId, jobId);
          assert.equal(uId, studentUserId);
          delegatedCheck = true;
          return true;
        },
      };

      const mockPrisma = {
        job: {
          findUnique: async () => ({
            id: jobId,
            title: 'Full Stack Dev',
            description: 'Awesome job',
            required_skills: ['React'],
            employment_type: 'FULL_TIME',
            status: 'ACTIVE',
            recruiter_id: recruiterId,
            company: {
              id: companyId,
              name: 'Acme',
              website: null,
              logo_url: null,
            },
            created_at: new Date(),
          }),
        },
      };

      const jobService = new JobService(mockPrisma, {}, mockAppService);
      const result = await jobService.getJobById(jobId, {
        userId: studentUserId,
        role: 'STUDENT',
        email: 'student@example.com',
      });

      assert.equal(delegatedCheck, true);
      assert.equal(result.has_applied, true);
    });

    it('createJob delegates recruiter verification to RecruiterService', async () => {
      let recruiterServiceCalled = false;
      const mockRecruiterService = {
        getProfileByUserId: async (uId) => {
          assert.equal(uId, recruiterUserId);
          recruiterServiceCalled = true;
          return {
            id: recruiterId,
            first_name: 'Sarah',
            last_name: 'Connor',
            is_approved: true,
            company: {
              id: companyId,
              name: 'Acme Systems',
            },
          };
        },
      };

      const mockPrisma = {
        job: {
          create: async ({ data }) => {
            assert.equal(data.recruiter_id, recruiterId);
            assert.equal(data.company_id, companyId);
            return { id: jobId, status: 'PENDING' };
          },
        },
      };

      const jobService = new JobService(mockPrisma, mockRecruiterService, {});
      const created = await jobService.createJob(recruiterUserId, {
        title: 'Platform Engineer',
        description: 'Design and build cloud infrastructure using modern tooling.',
        required_skills: ['Kubernetes', 'Go'],
        employment_type: 'FULL_TIME',
      });

      assert.equal(recruiterServiceCalled, true);
      assert.equal(created.id, jobId);
      assert.equal(created.status, 'PENDING');
    });

    it('getJobsByRecruiterUserId delegates recruiter profile lookup to RecruiterService', async () => {
      let recruiterServiceCalled = false;
      const mockRecruiterService = {
        getProfileByUserId: async (uId) => {
          assert.equal(uId, recruiterUserId);
          recruiterServiceCalled = true;
          return {
            id: recruiterId,
            first_name: 'Sarah',
            last_name: 'Connor',
            is_approved: true,
            company: { id: companyId, name: 'Acme' },
          };
        },
      };

      const mockPrisma = {
        job: {
          findMany: async ({ where, orderBy }) => {
            assert.equal(where.recruiter_id, recruiterId);
            assert.equal(orderBy?.created_at, 'desc');
            return [
              {
                id: jobId,
                title: 'Backend Engineer',
                description: 'Backend work',
                required_skills: ['Go', 'Postgres'],
                employment_type: 'FULL_TIME',
                status: 'ACTIVE',
                created_at: new Date(),
                company: {
                  id: companyId,
                  name: 'Acme Inc',
                  website: null,
                  logo_url: null,
                },
              },
            ];
          },
        },
      };

      const jobService = new JobService(mockPrisma, mockRecruiterService, {});
      const jobs = await jobService.getJobsByRecruiterUserId(recruiterUserId);

      assert.equal(recruiterServiceCalled, true);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].title, 'Backend Engineer');
    });
  });

  describe('RecruiterService boundary delegation', () => {
    it('updateProfileByUserId delegates company existence check to CompanyService', async () => {
      let companyServiceCalled = false;
      const mockCompanyService = {
        getCompanyById: async (id) => {
          assert.equal(id, companyId);
          companyServiceCalled = true;
          return { id, name: 'Acme Inc', website: null, logo_url: null };
        },
      };

      const mockPrisma = {
        recruiter: {
          findUnique: async ({ where }) => {
            if (where.user_id === recruiterUserId) {
              return { id: recruiterId, user_id: recruiterUserId };
            }
            return null;
          },
          update: async ({ data }) => ({
            id: recruiterId,
            first_name: 'Jane',
            last_name: 'Doe',
            is_approved: true,
            company: {
              id: data.company_id,
              name: 'Acme Inc',
              website: null,
              logo_url: null,
            },
          }),
        },
      };

      const recruiterService = new RecruiterService(
        mockPrisma,
        mockCompanyService
      );

      const updated = await recruiterService.updateProfileByUserId(
        recruiterUserId,
        { company_id: companyId }
      );

      assert.equal(companyServiceCalled, true);
      assert.equal(updated.first_name, 'Jane');
    });
  });

  describe('ResumeService boundary delegation', () => {
    it('getResumeFile delegates recruiter application access verification to ApplicationService', async () => {
      let appServiceCalled = false;
      const mockAppService = {
        hasRecruiterAccessToResume: async (rId, rUserId) => {
          assert.equal(rId, resumeId);
          assert.equal(rUserId, recruiterUserId);
          appServiceCalled = true;
          return true;
        },
      };

      const mockPrisma = {
        resume: {
          findFirst: async () => ({
            id: resumeId,
            student_id: studentId,
            file_key: 'resumes/student-1/file.pdf',
            file_url: 'https://storage.local/resumes/student-1/file.pdf',
            student: {
              first_name: 'Alice',
              last_name: 'Smith',
              user_id: studentUserId,
            },
          }),
        },
      };

      const mockStorageService = {
        getFileBuffer: async () => Buffer.from('mock-pdf-buffer'),
      };

      const resumeService = new ResumeService(
        mockPrisma,
        null, // studentService
        mockStorageService,
        null, // queueService
        mockAppService
      );

      const result = await resumeService.getResumeFile(
        recruiterUserId,
        'RECRUITER',
        resumeId
      );

      assert.equal(appServiceCalled, true);
      assert.equal(Buffer.isBuffer(result.buffer), true);
      assert.equal(typeof result.fileName, 'string');
    });
  });

  describe('InterviewPrepService boundary delegation', () => {
    it('generateInterviewPrep delegates application check to ApplicationService', async () => {
      let appServiceCalled = false;
      const mockAppService = {
        getApplicationByJobAndStudent: async (jId, sId) => {
          assert.equal(jId, jobId);
          assert.equal(sId, studentId);
          appServiceCalled = true;
          return { id: applicationId, status: 'APPLIED' };
        },
      };

      const mockPrisma = {
        job: {
          findUnique: async () => ({
            id: jobId,
            title: 'Senior Engineer',
            description: 'Job desc',
            required_skills: ['TypeScript'],
            employment_type: 'FULL_TIME',
            status: 'ACTIVE',
          }),
        },
      };

      const mockStudentService = {
        getProfileByUserId: async () => ({ id: studentId, skills: ['TypeScript'] }),
      };

      const mockAiProvider = {
        generateQuestions: async () => ({
          job_title: 'Senior Engineer',
          questions: [
            'How do you design scalable APIs?',
            'Explain PostgreSQL indexing strategies.',
            'What is your approach to concurrency control?',
            'How do you handle background job failures?',
            'Describe a challenging debugging experience.',
          ],
        }),
      };

      const mockQuotaStore = {
        reserveSlot: async () => ({ id: 'reservation-123' }),
        refundSlot: async () => {},
      };

      const interviewPrepService = new InterviewPrepService(
        mockPrisma,
        mockStudentService,
        mockAiProvider,
        mockQuotaStore,
        mockAppService
      );

      const prep = await interviewPrepService.generateInterviewPrep(
        studentUserId,
        jobId
      );

      assert.equal(appServiceCalled, true);
      assert.equal(prep.job_title, 'Senior Engineer');
      assert.equal(prep.questions.length, 5);
    });
  });
});
