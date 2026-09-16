const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { QUEUE_NAMES } = require('../dist/core/queue/queue.types');
const { AuthService } = require('../dist/modules/auth/auth.service');
const {
  ApplicationService,
} = require('../dist/modules/application/application.service');
const {
  NotificationEmailWorker,
} = require('../dist/modules/notifications/workers/notification-email.worker');

describe('Asynchronous Transactional Email Events (Phase 5.17.1)', () => {
  // ---------------------------------------------------------------------------
  // 1. User Registration Event Integration
  // ---------------------------------------------------------------------------
  describe('AuthService — Registration Event', () => {
    let mockPrisma;
    let mockPasswordService;
    let mockTokenService;
    let mockQueueService;
    let authService;
    let sentJobs;

    beforeEach(() => {
      sentJobs = [];
      mockQueueService = {
        send: async (queueName, data, options) => {
          sentJobs.push({ queueName, data, options });
          return 'mock-job-id-123';
        },
      };

      mockPasswordService = {
        hash: async (password) => `hashed_${password}`,
        compare: async () => true,
        dummyCompare: async () => {},
      };

      mockTokenService = {
        signToken: async (user) => `mock_token_${user.id}`,
      };

      mockPrisma = {
        user: {
          findUnique: async () => null,
        },
        $transaction: async (fn) => {
          const tx = {
            user: {
              create: async ({ data }) => ({
                id: 'user-uuid-1111',
                email: data.email,
                role: data.role,
                created_at: new Date(),
                updated_at: new Date(),
                is_banned: false,
              }),
            },
            student: {
              create: async () => ({ id: 'student-uuid-2222' }),
            },
            recruiter: {
              create: async () => ({ id: 'recruiter-uuid-3333' }),
            },
          };
          return fn(tx);
        },
      };

      authService = new AuthService(
        mockPrisma,
        mockPasswordService,
        mockTokenService,
        mockQueueService
      );
    });

    it('should enqueue welcome email job after student registration succeeds', async () => {
      const result = await authService.register({
        email: 'student@example.com',
        password: 'Password123!',
        role: 'STUDENT',
      });

      assert.equal(result.email, 'student@example.com');
      assert.equal(result.role, 'STUDENT');
      assert.equal(sentJobs.length, 1);

      const job = sentJobs[0];
      assert.equal(job.queueName, QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME);
      assert.deepEqual(job.data, {
        userId: 'user-uuid-1111',
        email: 'student@example.com',
        role: 'STUDENT',
      });
      assert.equal(job.options.singletonKey, 'welcome:user-uuid-1111');
      assert.equal(job.options.retryLimit, 3);
      assert.equal(job.options.retryBackoff, true);
    });

    it('should enqueue welcome email job after recruiter registration succeeds', async () => {
      const result = await authService.register({
        email: 'recruiter@company.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });

      assert.equal(result.email, 'recruiter@company.com');
      assert.equal(result.role, 'RECRUITER');
      assert.equal(sentJobs.length, 1);
      assert.equal(sentJobs[0].data.role, 'RECRUITER');
    });

    it('should NOT enqueue welcome email job if email is already registered', async () => {
      mockPrisma.user.findUnique = async () => ({
        id: 'existing-id',
        email: 'duplicate@example.com',
      });

      await assert.rejects(
        () =>
          authService.register({
            email: 'duplicate@example.com',
            password: 'Password123!',
            role: 'STUDENT',
          }),
        { message: 'Email is already registered' }
      );

      assert.equal(sentJobs.length, 0);
    });

    it('should NOT enqueue welcome email job if database transaction fails/rolls back', async () => {
      mockPrisma.$transaction = async () => {
        throw new Error('Database transaction connection error');
      };

      await assert.rejects(
        () =>
          authService.register({
            email: 'failed@example.com',
            password: 'Password123!',
            role: 'STUDENT',
          }),
        { message: 'Database transaction connection error' }
      );

      assert.equal(sentJobs.length, 0);
    });

    it('should guarantee no password, hash, or auth token in the queue payload', async () => {
      await authService.register({
        email: 'safety@example.com',
        password: 'SuperSecretPassword!',
        role: 'STUDENT',
      });

      assert.equal(sentJobs.length, 1);
      const payload = JSON.stringify(sentJobs[0].data);
      assert.equal(payload.includes('SuperSecretPassword!'), false);
      assert.equal(payload.includes('hashed_'), false);
      assert.equal(payload.includes('mock_token_'), false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Application Submission Event Integration
  // ---------------------------------------------------------------------------
  describe('ApplicationService — Application Submission Event', () => {
    let mockPrisma;
    let mockQueueService;
    let appService;
    let sentJobs;

    const validUserId = '11111111-1111-4111-8111-111111111111';
    const validStudentId = '22222222-2222-4222-8222-222222222222';
    const validJobId = '33333333-3333-4333-8333-333333333333';
    const validResumeId = '44444444-4444-4444-8444-444444444444';
    const validApplicationId = '55555555-5555-4555-8555-555555555555';

    beforeEach(() => {
      sentJobs = [];
      mockQueueService = {
        send: async (queueName, data, options) => {
          sentJobs.push({ queueName, data, options });
          return 'mock-app-job-id';
        },
      };

      mockPrisma = {
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
          create: async ({ data }) => ({
            id: validApplicationId,
            job_id: data.job_id,
            student_id: data.student_id,
            resume_id: data.resume_id,
            status: data.status,
            applied_at: new Date(),
          }),
        },
      };

      appService = new ApplicationService(mockPrisma, mockQueueService);
    });

    it('should enqueue both student confirmation and recruiter notification jobs upon successful application', async () => {
      const result = await appService.applyToJob(validUserId, validJobId, {
        resume_id: validResumeId,
      });

      assert.equal(result.application_id, validApplicationId);
      assert.equal(result.status, 'APPLIED');
      assert.equal(sentJobs.length, 2);

      const studentJob = sentJobs.find(
        (j) =>
          j.queueName ===
          QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT
      );
      assert.ok(studentJob);
      assert.deepEqual(studentJob.data, { applicationId: validApplicationId });
      assert.equal(
        studentJob.options.singletonKey,
        `app-sub-student:${validApplicationId}`
      );

      const recruiterJob = sentJobs.find(
        (j) =>
          j.queueName ===
          QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER
      );
      assert.ok(recruiterJob);
      assert.deepEqual(recruiterJob.data, { applicationId: validApplicationId });
      assert.equal(
        recruiterJob.options.singletonKey,
        `app-sub-recruiter:${validApplicationId}`
      );
    });

    it('should NOT enqueue notification jobs if applicant already applied', async () => {
      mockPrisma.application.findUnique = async () => ({
        id: 'already-existing-app-id',
      });

      await assert.rejects(
        () =>
          appService.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        { message: 'Student has already applied to this job' }
      );

      assert.equal(sentJobs.length, 0);
    });

    it('should NOT enqueue notification jobs if job is inactive', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        status: 'PENDING',
      });

      await assert.rejects(
        () =>
          appService.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        { message: 'Job is not in ACTIVE status' }
      );

      assert.equal(sentJobs.length, 0);
    });

    it('should NOT enqueue notification jobs if resume belongs to another student', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: validResumeId,
        student_id: 'different-student-uuid',
      });

      await assert.rejects(
        () =>
          appService.applyToJob(validUserId, validJobId, {
            resume_id: validResumeId,
          }),
        { message: 'Resume does not belong to the authenticated student' }
      );

      assert.equal(sentJobs.length, 0);
    });

    it('should verify queue payload contains only applicationId (zero resume binaries or personal data)', async () => {
      await appService.applyToJob(validUserId, validJobId, {
        resume_id: validResumeId,
      });

      for (const job of sentJobs) {
        assert.deepEqual(Object.keys(job.data), ['applicationId']);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Application Status Update Event Integration
  // ---------------------------------------------------------------------------
  describe('ApplicationService — Status Update Event', () => {
    let mockPrisma;
    let mockQueueService;
    let appService;
    let sentJobs;

    const validRecruiterUserId = '66666666-6666-4666-8666-666666666666';
    const validRecruiterId = '77777777-7777-4777-8777-777777777777';
    const validAppId = '88888888-8888-4888-8888-888888888888';

    beforeEach(() => {
      sentJobs = [];
      mockQueueService = {
        send: async (queueName, data, options) => {
          sentJobs.push({ queueName, data, options });
          return 'mock-status-job-id';
        },
      };

      mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: validRecruiterId,
            user_id: validRecruiterUserId,
          }),
        },
        application: {
          findUnique: async () => ({
            id: validAppId,
            status: 'APPLIED',
            job: {
              recruiter_id: validRecruiterId,
            },
          }),
          update: async ({ where, data }) => ({
            id: where.id,
            status: data.status,
            updated_at: new Date(),
          }),
        },
      };

      appService = new ApplicationService(mockPrisma, mockQueueService);
    });

    it('should enqueue notification job when application is SHORTLISTED', async () => {
      const result = await appService.updateApplicationStatus(
        validRecruiterUserId,
        validAppId,
        { status: 'SHORTLISTED' }
      );

      assert.equal(result.status, 'SHORTLISTED');
      assert.equal(sentJobs.length, 1);

      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS
      );
      assert.deepEqual(job.data, {
        applicationId: validAppId,
        status: 'SHORTLISTED',
      });
      assert.equal(
        job.options.singletonKey,
        `app-status:${validAppId}:SHORTLISTED`
      );
    });

    it('should enqueue notification job when application is REJECTED', async () => {
      const result = await appService.updateApplicationStatus(
        validRecruiterUserId,
        validAppId,
        { status: 'REJECTED' }
      );

      assert.equal(result.status, 'REJECTED');
      assert.equal(sentJobs.length, 1);

      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS
      );
      assert.deepEqual(job.data, {
        applicationId: validAppId,
        status: 'REJECTED',
      });
      assert.equal(
        job.options.singletonKey,
        `app-status:${validAppId}:REJECTED`
      );
    });

    it('should NOT enqueue notification job when status update fails validation', async () => {
      // Trying an invalid transition: REJECTED cannot transition to anything
      mockPrisma.application.findUnique = async () => ({
        id: validAppId,
        status: 'REJECTED',
        job: { recruiter_id: validRecruiterId },
      });

      await assert.rejects(
        () =>
          appService.updateApplicationStatus(validRecruiterUserId, validAppId, {
            status: 'SHORTLISTED',
          }),
        { message: 'Cannot transition application status from REJECTED to SHORTLISTED' }
      );

      assert.equal(sentJobs.length, 0);
    });

    it('should NOT enqueue notification job if recruiter does not own the job', async () => {
      mockPrisma.application.findUnique = async () => ({
        id: validAppId,
        status: 'APPLIED',
        job: { recruiter_id: 'different-recruiter-id' },
      });

      await assert.rejects(
        () =>
          appService.updateApplicationStatus(validRecruiterUserId, validAppId, {
            status: 'SHORTLISTED',
          }),
        { message: 'Recruiter does not own the parent job' }
      );

      assert.equal(sentJobs.length, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Notification Email Worker Execution
  // ---------------------------------------------------------------------------
  describe('NotificationEmailWorker', () => {
    let mockPrisma;
    let mockQueueService;
    let mockEmailService;
    let worker;
    let dispatchedEmails;

    beforeEach(() => {
      dispatchedEmails = [];
      mockQueueService = {
        work: async () => {},
      };
      mockEmailService = {
        sendEmail: async (options) => {
          dispatchedEmails.push(options);
          return { success: true, messageId: 'mock-sent-msg-1' };
        },
      };

      mockPrisma = {
        user: {
          findUnique: async ({ where }) => ({
            id: where.id,
            email: 'student@example.com',
            is_banned: false,
            role: 'STUDENT',
          }),
        },
        application: {
          findUnique: async ({ where }) => ({
            id: where.id,
            status: 'APPLIED',
            student: {
              first_name: 'John',
              last_name: 'Doe',
              user: { email: 'student-john@example.com' },
            },
            job: {
              title: 'Backend Engineer',
              company: { name: 'Acme Corp' },
              recruiter: {
                first_name: 'Jane',
                last_name: 'Recruiter',
                user: { email: 'jane@acmecorp.com' },
              },
            },
          }),
        },
      };

      worker = new NotificationEmailWorker(
        mockQueueService,
        mockPrisma,
        mockEmailService
      );
    });

    it('handleWelcomeJob should send welcome email for valid active student', async () => {
      await worker.handleWelcomeJob({
        id: 'job-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-123',
          email: 'student@example.com',
          role: 'STUDENT',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].to, 'student@example.com');
      assert.match(dispatchedEmails[0].subject, /Welcome to CareerForge!/);
      assert.match(dispatchedEmails[0].text, /student account is now active/);
    });

    it('handleWelcomeJob should format recruiter-specific welcome email', async () => {
      mockPrisma.user.findUnique = async ({ where }) => ({
        id: where.id,
        email: 'recruiter@tech.com',
        is_banned: false,
        role: 'RECRUITER',
      });

      await worker.handleWelcomeJob({
        id: 'job-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-recruiter-1',
          email: 'recruiter@tech.com',
          role: 'RECRUITER',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].to, 'recruiter@tech.com');
      assert.match(dispatchedEmails[0].subject, /Welcome to CareerForge for Employers!/);
      assert.match(dispatchedEmails[0].text, /recruiter account is now active/);
    });

    it('handleWelcomeJob should skip sending if user is not found or is banned', async () => {
      // User not found
      mockPrisma.user.findUnique = async () => null;
      await worker.handleWelcomeJob({
        id: 'job-3',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'missing-user',
          email: 'missing@example.com',
          role: 'STUDENT',
        },
      });
      assert.equal(dispatchedEmails.length, 0);

      // User is banned
      mockPrisma.user.findUnique = async () => ({
        id: 'banned-user',
        email: 'banned@example.com',
        is_banned: true,
      });
      await worker.handleWelcomeJob({
        id: 'job-4',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'banned-user',
          email: 'banned@example.com',
          role: 'STUDENT',
        },
      });
      assert.equal(dispatchedEmails.length, 0);
    });

    it('handleApplicationSubmittedStudentJob should send confirmation email to student', async () => {
      await worker.handleApplicationSubmittedStudentJob({
        id: 'job-5',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT,
        data: { applicationId: 'app-100' },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].to, 'student-john@example.com');
      assert.match(dispatchedEmails[0].subject, /Application Received: Backend Engineer at Acme Corp/);
      assert.match(dispatchedEmails[0].text, /Hello John Doe/);
      assert.match(dispatchedEmails[0].html, /Backend Engineer/);
    });

    it('handleApplicationSubmittedRecruiterJob should send new applicant alert to recruiter', async () => {
      await worker.handleApplicationSubmittedRecruiterJob({
        id: 'job-6',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER,
        data: { applicationId: 'app-100' },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].to, 'jane@acmecorp.com');
      assert.match(dispatchedEmails[0].subject, /New Applicant for Backend Engineer: John Doe/);
      assert.match(dispatchedEmails[0].text, /Hello Jane Recruiter/);
      assert.match(dispatchedEmails[0].text, /John Doe has applied for "Backend Engineer"/);
    });

    it('handleApplicationStatusJob should send SHORTLISTED notification with guidance', async () => {
      await worker.handleApplicationStatusJob({
        id: 'job-7',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        data: { applicationId: 'app-100', status: 'SHORTLISTED' },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].to, 'student-john@example.com');
      assert.match(dispatchedEmails[0].subject, /Great News: You have been shortlisted/);
      assert.match(dispatchedEmails[0].text, /has been shortlisted by the hiring team/);
      assert.match(dispatchedEmails[0].html, /AI Interview Preparation/);
    });

    it('handleApplicationStatusJob should send REJECTED notification with supportive guidance', async () => {
      await worker.handleApplicationStatusJob({
        id: 'job-8',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        data: { applicationId: 'app-100', status: 'REJECTED' },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].to, 'student-john@example.com');
      assert.match(dispatchedEmails[0].subject, /Update on your application for Backend Engineer/);
      assert.match(dispatchedEmails[0].text, /decided not to move forward with your application/);
    });

    it('should rethrow provider errors to allow pg-boss retry', async () => {
      mockEmailService.sendEmail = async () => {
        throw new Error('Resend network timeout');
      };

      await assert.rejects(
        () =>
          worker.handleWelcomeJob({
            id: 'job-retry-1',
            name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
            data: {
              userId: 'user-retry',
              email: 'student@example.com',
              role: 'STUDENT',
            },
          }),
        { message: 'Resend network timeout' }
      );
    });

    it('should safely skip jobs when database entity is missing without failing the worker', async () => {
      mockPrisma.application.findUnique = async () => null;

      await worker.handleApplicationSubmittedStudentJob({
        id: 'job-missing-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT,
        data: { applicationId: 'nonexistent-app' },
      });

      assert.equal(dispatchedEmails.length, 0);
    });
  });
});
