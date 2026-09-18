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

  // ---------------------------------------------------------------------------
  // 5. Phase 6.5-C: Transactional Email Idempotency & Duplicate Delivery Hardening
  // ---------------------------------------------------------------------------
  describe('Phase 6.5-C: Transactional Email Idempotency & Duplicate Delivery Hardening', () => {
    function createMockPrismaWithEmailDelivery() {
      const emailDeliveries = new Map();

      return {
        user: {
          findUnique: async ({ where }) => ({
            id: where.id,
            email: 'candidate@example.com',
            is_banned: false,
            role: 'STUDENT',
          }),
        },
        application: {
          findUnique: async ({ where }) => ({
            id: where.id,
            status: 'APPLIED',
            student: {
              first_name: 'Jane',
              last_name: 'Doe',
              user: { email: 'jane@example.com' },
            },
            job: {
              title: 'Backend Engineer',
              company: { name: 'Acme Corp' },
              recruiter: {
                first_name: 'Recruiter',
                last_name: 'Smith',
                user: { email: 'recruiter@acme.com' },
              },
            },
          }),
        },
        emailDelivery: {
          findUnique: async ({ where }) => {
            const record = emailDeliveries.get(where.idempotency_key);
            return record ? { ...record } : null;
          },
          create: async ({ data }) => {
            if (emailDeliveries.has(data.idempotency_key)) {
              const err = new Error(
                'Unique constraint failed on the fields: (`idempotency_key`)'
              );
              err.code = 'P2002';
              throw err;
            }
            const record = {
              id: `delivery-${Date.now()}-${Math.random()}`,
              idempotency_key: data.idempotency_key,
              event_type: data.event_type,
              recipient_email: data.recipient_email,
              subject: data.subject,
              body_text: data.body_text || null,
              body_html: data.body_html || null,
              status: data.status || 'PENDING',
              attempts: data.attempts || 1,
              message_id: data.message_id || null,
              error_message: data.error_message || null,
              sent_at: data.sent_at || null,
              created_at: new Date(),
              updated_at: new Date(),
            };
            emailDeliveries.set(data.idempotency_key, record);
            return { ...record };
          },
          update: async ({ where, data }) => {
            const record = emailDeliveries.get(where.idempotency_key);
            if (!record) {
              throw new Error(
                `Record to update not found: ${where.idempotency_key}`
              );
            }
            if (data.status !== undefined) record.status = data.status;
            if (data.message_id !== undefined) record.message_id = data.message_id;
            if (data.error_message !== undefined)
              record.error_message = data.error_message;
            if (data.sent_at !== undefined) record.sent_at = data.sent_at;
            if (data.attempts) {
              if (typeof data.attempts === 'object' && data.attempts.increment) {
                record.attempts += data.attempts.increment;
              } else {
                record.attempts = data.attempts;
              }
            }
            record.updated_at = new Date();
            emailDeliveries.set(where.idempotency_key, record);
            return { ...record };
          },
          _store: emailDeliveries,
        },
      };
    }

    it('1. First delivery creates and marks SENT delivery record in database with message_id', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const dispatched = [];
      const mockEmailService = {
        sendEmail: async (options) => {
          dispatched.push(options);
          return { success: true, messageId: 'msg-success-1' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      await worker.handleWelcomeJob({
        id: 'job-welcome-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-idem-1',
          email: 'candidate@example.com',
          role: 'STUDENT',
        },
      });

      assert.equal(dispatched.length, 1);
      assert.equal(
        dispatched[0].idempotencyKey,
        'email:welcome:user-idem-1'
      );

      const dbRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-idem-1'
      );
      assert.ok(dbRecord);
      assert.equal(dbRecord.status, 'SENT');
      assert.equal(dbRecord.attempts, 1);
      assert.equal(dbRecord.message_id, 'msg-success-1');
      assert.equal(dbRecord.error_message, null);
      assert.ok(dbRecord.sent_at instanceof Date);
    });

    it('2. Retry with same idempotency key does not create another logical delivery', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const dispatched = [];
      const mockEmailService = {
        sendEmail: async (options) => {
          dispatched.push(options);
          return { success: true, messageId: 'msg-success-2' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-welcome-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-idem-2',
          email: 'candidate@example.com',
          role: 'STUDENT',
        },
      };

      // Initial successful delivery
      await worker.handleWelcomeJob(jobEnvelope);
      assert.equal(dispatched.length, 1);

      // Subsequent retry of identical job
      await worker.handleWelcomeJob(jobEnvelope);
      // Provider sendEmail was NOT called again; exactly 1 email dispatched!
      assert.equal(dispatched.length, 1);

      const dbRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-idem-2'
      );
      assert.equal(dbRecord.status, 'SENT');
      assert.equal(dbRecord.attempts, 1);
    });

    it('3. Transient provider failure records FAILED and allows safe retry without duplicate record', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      let callCount = 0;
      const mockEmailService = {
        sendEmail: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('ETIMEDOUT: Connection to Resend timed out');
          }
          return { success: true, messageId: 'msg-recovered-3' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-transient-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-transient-1',
          email: 'candidate@example.com',
          role: 'STUDENT',
        },
      };

      // First run: throws transient failure
      await assert.rejects(
        () => worker.handleWelcomeJob(jobEnvelope),
        { message: 'ETIMEDOUT: Connection to Resend timed out' }
      );

      const failedRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-transient-1'
      );
      assert.ok(failedRecord);
      assert.equal(failedRecord.status, 'FAILED');
      assert.match(failedRecord.error_message, /ETIMEDOUT/);
      assert.equal(failedRecord.attempts, 1);

      // Second run: pg-boss retries and succeeds
      await worker.handleWelcomeJob(jobEnvelope);

      const successRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-transient-1'
      );
      assert.equal(successRecord.status, 'SENT');
      assert.equal(successRecord.attempts, 2);
      assert.equal(successRecord.message_id, 'msg-recovered-3');
      assert.equal(successRecord.error_message, null);
      // Still only one entry in store (no duplicate row)
      assert.equal(mockPrisma.emailDelivery._store.size, 1);
    });

    it('4. Permanent provider failure marks FAILED and rethrows for queue handling', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const mockEmailService = {
        sendEmail: async () => {
          throw new Error('Resend API error (422): Domain not verified');
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      await assert.rejects(
        () =>
          worker.handleWelcomeJob({
            id: 'job-perm-1',
            name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
            data: {
              userId: 'user-perm-1',
              email: 'candidate@example.com',
              role: 'STUDENT',
            },
          }),
        { message: 'Resend API error (422): Domain not verified' }
      );

      const dbRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-perm-1'
      );
      assert.ok(dbRecord);
      assert.equal(dbRecord.status, 'FAILED');
      assert.match(dbRecord.error_message, /Domain not verified/);
    });

    it('5. Ambiguous provider failure safely recovers on retry via provider idempotency', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const { MockEmailProvider } = require('../dist/modules/notifications/email/mock-email.provider');
      const { EmailService } = require('../dist/modules/notifications/email/email.service');

      const mockProvider = new MockEmailProvider();
      const emailService = new EmailService(mockProvider);

      let simulateNetworkDropOnFirstCall = true;
      const originalSend = mockProvider.send.bind(mockProvider);
      mockProvider.send = async (options) => {
        const res = await originalSend(options);
        if (simulateNetworkDropOnFirstCall) {
          simulateNetworkDropOnFirstCall = false;
          // Provider accepted the email, but client socket dropped before receiving response
          throw new Error('ECONNRESET: Socket closed unexpectedly');
        }
        return res;
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        emailService
      );

      const jobEnvelope = {
        id: 'job-ambig-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-ambig-1',
          email: 'candidate@example.com',
          role: 'STUDENT',
        },
      };

      // First run: email accepted by provider, but client throws network drop
      await assert.rejects(
        () => worker.handleWelcomeJob(jobEnvelope),
        { message: 'ECONNRESET: Socket closed unexpectedly' }
      );

      // Verify provider has recorded 1 email
      assert.equal(mockProvider.count(), 1);
      const initialMessageId = mockProvider.getLastEmail().messageId;

      // Second run: pg-boss retries with the same deterministic idempotency key
      await worker.handleWelcomeJob(jobEnvelope);

      // Provider was NOT sent a duplicate email; count is STILL 1
      assert.equal(mockProvider.count(), 1);
      assert.equal(mockProvider.getLastEmail().messageId, initialMessageId);

      // Database delivery record transitioned to SENT
      const dbRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-ambig-1'
      );
      assert.equal(dbRecord.status, 'SENT');
      assert.equal(dbRecord.message_id, initialMessageId);
    });

    it('6. Concurrent duplicate worker execution is protected by database uniqueness constraint', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const dispatched = [];
      const mockEmailService = {
        sendEmail: async (options) => {
          dispatched.push(options);
          return { success: true, messageId: 'msg-concurrent-1' };
        },
      };

      const worker1 = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );
      const worker2 = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-concurrent-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-concurrent-1',
          email: 'candidate@example.com',
          role: 'STUDENT',
        },
      };

      // Simulate sequential/concurrent attempts
      await Promise.all([
        worker1.handleWelcomeJob(jobEnvelope),
        worker2.handleWelcomeJob(jobEnvelope),
      ]);

      // Exactly 1 email dispatched to provider
      assert.equal(dispatched.length, 1);
      assert.equal(mockPrisma.emailDelivery._store.size, 1);
      const record = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-concurrent-1'
      );
      assert.equal(record.status, 'SENT');
    });

    it('7. Different business events produce distinct deterministic idempotency keys', () => {
      const user1Key = `email:welcome:user-1`;
      const user2Key = `email:welcome:user-2`;
      const appStudentKey = `email:app-sub-student:app-1`;
      const appRecruiterKey = `email:app-sub-recruiter:app-1`;
      const appStatusShortlist = `email:app-status:app-1:SHORTLISTED`;
      const appStatusReject = `email:app-status:app-1:REJECTED`;

      assert.notEqual(user1Key, user2Key);
      assert.notEqual(appStudentKey, appRecruiterKey);
      assert.notEqual(appStatusShortlist, appStatusReject);
      assert.notEqual(user1Key, appStudentKey);
    });

    it('8. Same business event always produces identical deterministic idempotency key', () => {
      const run1 = `email:app-status:app-xyz:SHORTLISTED`;
      const run2 = `email:app-status:app-xyz:SHORTLISTED`;
      assert.equal(run1, run2);
    });

    it('9. All transactional handlers dispatch with correct deterministic idempotency key', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const dispatched = [];
      const mockEmailService = {
        sendEmail: async (options) => {
          dispatched.push(options);
          return { success: true, messageId: `msg-${dispatched.length}` };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      // 1. Welcome
      await worker.handleWelcomeJob({
        id: 'w-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: { userId: 'u-100', email: 'u@example.com', role: 'STUDENT' },
      });
      assert.equal(dispatched[0].idempotencyKey, 'email:welcome:u-100');

      // 2. Application Submitted Student
      await worker.handleApplicationSubmittedStudentJob({
        id: 's-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT,
        data: { applicationId: 'app-200' },
      });
      assert.equal(dispatched[1].idempotencyKey, 'email:app-sub-student:app-200');

      // 3. Application Submitted Recruiter
      await worker.handleApplicationSubmittedRecruiterJob({
        id: 'r-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER,
        data: { applicationId: 'app-200' },
      });
      assert.equal(dispatched[2].idempotencyKey, 'email:app-sub-recruiter:app-200');

      // 4. Application Status SHORTLISTED
      await worker.handleApplicationStatusJob({
        id: 'st-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        data: { applicationId: 'app-200', status: 'SHORTLISTED' },
      });
      assert.equal(
        dispatched[3].idempotencyKey,
        'email:app-status:app-200:SHORTLISTED'
      );

      // 5. Application Status REJECTED
      await worker.handleApplicationStatusJob({
        id: 'st-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        data: { applicationId: 'app-200', status: 'REJECTED' },
      });
      assert.equal(
        dispatched[4].idempotencyKey,
        'email:app-status:app-200:REJECTED'
      );

      assert.equal(dispatched.length, 5);
      assert.equal(mockPrisma.emailDelivery._store.size, 5);
    });

    it('10. Stale PENDING recovery: crashed worker older than 15s is reclaimed by next worker', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const idempotencyKey = 'email:welcome:crashed-worker-user';

      // Simulate a crashed worker that wrote PENDING 20 seconds ago and died
      const staleTimestamp = new Date(Date.now() - 20_000);
      mockPrisma.emailDelivery._store.set(idempotencyKey, {
        id: 'delivery-stale-1',
        idempotency_key: idempotencyKey,
        event_type: 'welcome',
        recipient_email: 'candidate@example.com',
        subject: 'Welcome to CareerForge!',
        status: 'PENDING',
        attempts: 1,
        message_id: null,
        error_message: null,
        sent_at: null,
        created_at: staleTimestamp,
        updated_at: staleTimestamp,
      });

      const dispatched = [];
      const mockEmailService = {
        sendEmail: async (options) => {
          dispatched.push(options);
          return { success: true, messageId: 'msg-recovered-stale' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      // New worker picks up retried job
      await worker.handleWelcomeJob({
        id: 'job-stale-retry',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'crashed-worker-user',
          email: 'candidate@example.com',
          role: 'STUDENT',
        },
      });

      // The stale PENDING lease was reclaimed and dispatched
      assert.equal(dispatched.length, 1);
      assert.equal(dispatched[0].idempotencyKey, idempotencyKey);

      const dbRecord = mockPrisma.emailDelivery._store.get(idempotencyKey);
      assert.equal(dbRecord.status, 'SENT');
      assert.equal(dbRecord.attempts, 2);
      assert.equal(dbRecord.message_id, 'msg-recovered-stale');
    });

    it('11. Resend HTTP 409 concurrent_idempotent_requests rethrows for queue backoff', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const { EmailDeliveryError } = require('../dist/modules/notifications/email/resend-email.provider');

      const mockEmailService = {
        sendEmail: async () => {
          throw new EmailDeliveryError(
            'Resend API error (409): concurrent_idempotent_requests',
            409
          );
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      await assert.rejects(
        () =>
          worker.handleWelcomeJob({
            id: 'job-409-test',
            name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
            data: {
              userId: 'user-409',
              email: 'candidate@example.com',
              role: 'STUDENT',
            },
          }),
        (err) => {
          assert.ok(err instanceof EmailDeliveryError);
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /concurrent_idempotent_requests/);
          return true;
        }
      );

      // Verify DB record remained PENDING for next queue retry
      const dbRecord = mockPrisma.emailDelivery._store.get(
        'email:welcome:user-409'
      );
      assert.ok(dbRecord);
      assert.equal(dbRecord.status, 'PENDING');
      assert.match(dbRecord.error_message, /concurrent_idempotent_requests/);
    });

    it('12. Application status handler supports explicit eventId when provided', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const dispatched = [];
      const mockEmailService = {
        sendEmail: async (options) => {
          dispatched.push(options);
          return { success: true, messageId: 'msg-event-id' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      await worker.handleApplicationStatusJob({
        id: 'job-explicit-event',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        data: {
          applicationId: 'app-500',
          status: 'SHORTLISTED',
          eventId: 'evt-transition-uuid-12345',
        },
      });

      assert.equal(dispatched.length, 1);
      assert.equal(
        dispatched[0].idempotencyKey,
        'email:app-status:evt-transition-uuid-12345'
      );

      const dbRecord = mockPrisma.emailDelivery._store.get(
        'email:app-status:evt-transition-uuid-12345'
      );
      assert.ok(dbRecord);
      assert.equal(dbRecord.status, 'SENT');
    });

    it('13. Retried execution always produces 100% identical Resend payload for identical idempotency key', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      const payloads = [];
      let callCount = 0;
      const mockEmailService = {
        sendEmail: async (options) => {
          payloads.push(options);
          callCount++;
          if (callCount === 1) {
            throw new Error('Ambiguous network drop');
          }
          return { success: true, messageId: 'msg-payload-identical' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-payload-test',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME,
        data: {
          userId: 'user-payload-consistent',
          email: 'consistent@example.com',
          role: 'STUDENT',
        },
      };

      // Attempt 1 (fails with network drop)
      await assert.rejects(() => worker.handleWelcomeJob(jobEnvelope));

      // Attempt 2 (retried by queue)
      await worker.handleWelcomeJob(jobEnvelope);

      assert.equal(payloads.length, 2);
      // Both attempts pass exactly identical payloads to the provider
      assert.equal(payloads[0].to, payloads[1].to);
      assert.equal(payloads[0].subject, payloads[1].subject);
      assert.equal(payloads[0].text, payloads[1].text);
      assert.equal(payloads[0].html, payloads[1].html);
      assert.equal(payloads[0].idempotencyKey, payloads[1].idempotencyKey);
    });

    it('14. Mutate job.title after initial enqueue: retry must send identical payload and preserve idempotency key', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      let jobTitle = 'Backend Intern';
      mockPrisma.application.findUnique = async () => ({
        id: 'app-mutate-job-title',
        status: 'APPLIED',
        student: {
          first_name: 'Jane',
          last_name: 'Doe',
          user: { email: 'jane@example.com' },
        },
        job: {
          title: jobTitle,
          company: { name: 'Acme Corp' },
          recruiter: {
            first_name: 'Recruiter',
            last_name: 'Smith',
            user: { email: 'recruiter@acme.com' },
          },
        },
      });

      const payloads = [];
      let callCount = 0;
      const mockEmailService = {
        sendEmail: async (options) => {
          payloads.push(options);
          callCount++;
          if (callCount === 1) {
            throw new Error('Transient timeout');
          }
          return { success: true, messageId: 'msg-job-title-test' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-title-mutate-envelope',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT,
        data: { applicationId: 'app-mutate-job-title' },
      };

      // Attempt 1: at t0 with jobTitle = 'Backend Intern' (fails transiently)
      await assert.rejects(() =>
        worker.handleApplicationSubmittedStudentJob(jobEnvelope)
      );
      assert.equal(payloads.length, 1);
      assert.match(payloads[0].subject, /Backend Intern/);

      // Mutation at t1: recruiter edits job title to 'Backend Engineer Intern'
      jobTitle = 'Backend Engineer Intern';

      // Attempt 2: at t2 (retry by pg-boss)
      await worker.handleApplicationSubmittedStudentJob(jobEnvelope);
      assert.equal(payloads.length, 2);

      // Provider receives the exact immutable snapshot, NOT the mutated jobTitle
      assert.deepEqual(payloads[0], payloads[1]);
      assert.equal(payloads[1].subject, payloads[0].subject);
      assert.match(payloads[1].subject, /Backend Intern/);
      assert.doesNotMatch(payloads[1].subject, /Backend Engineer Intern/);
      assert.equal(payloads[1].idempotencyKey, payloads[0].idempotencyKey);
    });

    it('15. Mutate company.name after initial enqueue: retry must send identical payload and preserve idempotency key', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      let companyName = 'Acme Inc';
      mockPrisma.application.findUnique = async () => ({
        id: 'app-mutate-company',
        status: 'APPLIED',
        student: {
          first_name: 'Jane',
          last_name: 'Doe',
          user: { email: 'jane@example.com' },
        },
        job: {
          title: 'Software Engineer',
          company: { name: companyName },
          recruiter: {
            first_name: 'Recruiter',
            last_name: 'Smith',
            user: { email: 'recruiter@acme.com' },
          },
        },
      });

      const payloads = [];
      let callCount = 0;
      const mockEmailService = {
        sendEmail: async (options) => {
          payloads.push(options);
          callCount++;
          if (callCount === 1) {
            throw new Error('Network reset');
          }
          return { success: true, messageId: 'msg-company-test' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-company-mutate-envelope',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_RECRUITER,
        data: { applicationId: 'app-mutate-company' },
      };

      // Attempt 1: at t0 with companyName = 'Acme Inc' (fails)
      await assert.rejects(() =>
        worker.handleApplicationSubmittedRecruiterJob(jobEnvelope)
      );
      assert.equal(payloads.length, 1);
      assert.match(payloads[0].text, /Acme Inc/);

      // Mutation at t1: recruiter renames company to 'Acme Global Holdings'
      companyName = 'Acme Global Holdings';

      // Attempt 2: at t2 (retry by pg-boss)
      await worker.handleApplicationSubmittedRecruiterJob(jobEnvelope);
      assert.equal(payloads.length, 2);

      // Provider receives identical payload from snapshot
      assert.deepEqual(payloads[0], payloads[1]);
      assert.equal(payloads[1].subject, payloads[0].subject);
      assert.match(payloads[1].text, /Acme Inc/);
      assert.doesNotMatch(payloads[1].text, /Acme Global Holdings/);
      assert.equal(payloads[1].idempotencyKey, payloads[0].idempotencyKey);
    });

    it('16. Mutate student/recruiter display name after initial enqueue: retry must send identical payload and preserve idempotency key', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      let studentFirstName = 'Alice';
      let recruiterFirstName = 'Bob';

      mockPrisma.application.findUnique = async () => ({
        id: 'app-mutate-name',
        status: 'APPLIED',
        student: {
          first_name: studentFirstName,
          last_name: 'Wonderland',
          user: { email: 'alice@example.com' },
        },
        job: {
          title: 'Frontend Engineer',
          company: { name: 'Acme Corp' },
          recruiter: {
            first_name: recruiterFirstName,
            last_name: 'Builder',
            user: { email: 'bob@acme.com' },
          },
        },
      });

      const payloads = [];
      let callCount = 0;
      const mockEmailService = {
        sendEmail: async (options) => {
          payloads.push(options);
          callCount++;
          if (callCount === 1) {
            throw new Error('Socket closed prematurely');
          }
          return { success: true, messageId: 'msg-name-test' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-name-mutate-envelope',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_SUBMITTED_STUDENT,
        data: {
          applicationId: 'app-mutate-name',
        },
      };

      // Attempt 1: at t0 with student name 'Alice'
      await assert.rejects(() =>
        worker.handleApplicationSubmittedStudentJob(jobEnvelope)
      );
      assert.equal(payloads.length, 1);
      assert.match(payloads[0].text, /Hello Alice/);

      // Mutation at t1: student changes first_name to 'Alicia' in DB
      studentFirstName = 'Alicia';
      recruiterFirstName = 'Robert';

      // Attempt 2: at t2 (retry by pg-boss)
      await worker.handleApplicationSubmittedStudentJob(jobEnvelope);
      assert.equal(payloads.length, 2);

      // Provider receives identical payload from snapshot, preserving byte-for-byte equality
      assert.deepEqual(payloads[0], payloads[1]);
      assert.equal(payloads[1].text, payloads[0].text);
      assert.match(payloads[1].text, /Hello Alice/);
      assert.doesNotMatch(payloads[1].text, /Hello Alicia/);
      assert.equal(payloads[1].idempotencyKey, payloads[0].idempotencyKey);
    });

    it('17. Status email retry after unrelated application data mutation: retry sends identical payload and preserves idempotency key', async () => {
      const mockPrisma = createMockPrismaWithEmailDelivery();
      let jobTitle = 'Lead Architect';
      let companyName = 'Pied Piper';
      mockPrisma.application.findUnique = async () => ({
        id: 'app-status-mutate',
        status: 'SHORTLISTED',
        student: {
          first_name: 'Dinesh',
          last_name: 'Chugtai',
          user: { email: 'dinesh@example.com' },
        },
        job: {
          title: jobTitle,
          company: { name: companyName },
        },
      });

      const payloads = [];
      let callCount = 0;
      const mockEmailService = {
        sendEmail: async (options) => {
          payloads.push(options);
          callCount++;
          if (callCount === 1) {
            throw new Error('Ambiguous 503 Provider Unavailable');
          }
          return { success: true, messageId: 'msg-status-mutate-test' };
        },
      };

      const worker = new NotificationEmailWorker(
        { work: async () => {} },
        mockPrisma,
        mockEmailService
      );

      const jobEnvelope = {
        id: 'job-status-mutate-envelope',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS,
        data: {
          applicationId: 'app-status-mutate',
          status: 'SHORTLISTED',
        },
      };

      // Attempt 1: at t0 with 'Lead Architect' at 'Pied Piper'
      await assert.rejects(() => worker.handleApplicationStatusJob(jobEnvelope));
      assert.equal(payloads.length, 1);
      assert.match(payloads[0].subject, /Lead Architect at Pied Piper/);

      // Mutation at t1: job title & company are edited in DB
      jobTitle = 'Principal Architect';
      companyName = 'Hooli';

      // Attempt 2: at t2 (retry by pg-boss)
      await worker.handleApplicationStatusJob(jobEnvelope);
      assert.equal(payloads.length, 2);

      // Provider receives identical payload from snapshot; idempotency key is preserved
      assert.deepEqual(payloads[0], payloads[1]);
      assert.equal(payloads[1].subject, payloads[0].subject);
      assert.match(payloads[1].subject, /Lead Architect at Pied Piper/);
      assert.doesNotMatch(payloads[1].subject, /Principal Architect at Hooli/);
      assert.equal(
        payloads[1].idempotencyKey,
        'email:app-status:app-status-mutate:SHORTLISTED'
      );
      assert.equal(payloads[1].idempotencyKey, payloads[0].idempotencyKey);
    });
  });
});
