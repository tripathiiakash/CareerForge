const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { QUEUE_NAMES } = require('../dist/core/queue/queue.types');
const {
  RecruiterService,
} = require('../dist/modules/recruiter/recruiter.service');
const {
  AdminRecruiterService,
} = require('../dist/modules/admin/admin-recruiter.service');
const { JobService } = require('../dist/modules/job/job.service');
const {
  NotificationEmailWorker,
} = require('../dist/modules/notifications/workers/notification-email.worker');

describe('Transactional Email Flows — Recruiter Verification & Job Moderation', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validRecruiterId = '22222222-2222-4222-8222-222222222222';
  const validCompanyId = '33333333-3333-4333-8333-333333333333';
  const validJobId = '44444444-4444-4444-8444-444444444444';

  // =========================================================================
  // 1. RecruiterService Verification Submission Producer
  // =========================================================================
  describe('1. RecruiterService — Verification Submission Producer', () => {
    let mockPrisma;
    let mockQueueService;
    let recruiterService;
    let sentJobs;

    beforeEach(() => {
      sentJobs = [];
      mockQueueService = {
        send: async (queueName, data, options) => {
          sentJobs.push({ queueName, data, options });
          return 'mock-job-id';
        },
      };

      mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: validRecruiterId,
            user_id: validUserId,
            first_name: 'Alex',
            last_name: 'Recruiter',
            is_approved: false,
            company: { id: validCompanyId, name: 'Acme Global', website: null, logo_url: null },
            verification: null,
          }),
        },
        recruiterVerification: {
          create: async ({ data }) => ({
            id: 'verif-1',
            ...data,
            created_at: new Date(),
            updated_at: new Date(),
          }),
          update: async ({ data }) => ({
            id: 'verif-1',
            ...data,
            updated_at: new Date(),
          }),
        },
      };

      recruiterService = new RecruiterService(
        mockPrisma,
        {}, // EvidenceStorageService mock
        mockQueueService
      );
    });

    it('1.1 should enqueue verification-submitted job on initial submission', async () => {
      await recruiterService.submitOrganization(validUserId, {
        organization_name: 'Acme Corp',
        website_url: 'https://acme.example.com',
      });

      assert.equal(sentJobs.length, 1);
      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED
      );
      assert.equal(job.data.recruiterId, validRecruiterId);
      assert.equal(job.data.isResubmission, false);
      assert.equal(job.options.retryLimit, 3);
    });

    it('1.2 should enqueue verification-submitted job with isResubmission=true when re-submitting', async () => {
      mockPrisma.recruiter.findUnique = async () => ({
        id: validRecruiterId,
        user_id: validUserId,
        first_name: 'Alex',
        last_name: 'Recruiter',
        is_approved: false,
        company: null,
        verification: {
          id: 'verif-1',
          recruiter_id: validRecruiterId,
          organization_name: 'Old Name',
          status: 'NEEDS_CLARIFICATION',
          clarification_message: 'Upload proof',
        },
      });

      await recruiterService.submitOrganization(validUserId, {
        organization_name: 'Acme Corp Updated',
      });

      assert.equal(sentJobs.length, 1);
      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED
      );
      assert.equal(job.data.recruiterId, validRecruiterId);
      assert.equal(job.data.isResubmission, true);
    });

    it('1.3 should succeed without error if queue service fails (non-blocking)', async () => {
      mockQueueService.send = async () => {
        throw new Error('pg-boss connection refused');
      };

      const result = await recruiterService.submitOrganization(validUserId, {
        organization_name: 'Acme Corp',
      });

      assert.ok(result);
      assert.equal(result.recruiter_id, validRecruiterId);
    });
  });

  // =========================================================================
  // 2. AdminRecruiterService Moderation Producer
  // =========================================================================
  describe('2. AdminRecruiterService — Verification Moderation Producer', () => {
    let mockPrisma;
    let mockQueueService;
    let adminRecruiterService;
    let sentJobs;

    beforeEach(() => {
      sentJobs = [];
      mockQueueService = {
        send: async (queueName, data, options) => {
          sentJobs.push({ queueName, data, options });
          return 'mock-job-id';
        },
      };

      mockPrisma = {
        recruiter: {
          findFirst: async () => ({
            id: validRecruiterId,
            user_id: validUserId,
            first_name: 'Alex',
            last_name: 'Recruiter',
            is_approved: false,
            company_id: validCompanyId,
            company: { id: validCompanyId, name: 'Acme Corp', website: null, logo_url: null },
            user: { id: validUserId, email: 'recruiter@acme.com', is_banned: false },
            verification: {
              id: 'verif-1',
              recruiter_id: validRecruiterId,
              organization_name: 'Acme Corp',
              status: 'PENDING',
            },
          }),
          update: async ({ data }) => ({
            id: validRecruiterId,
            user_id: validUserId,
            first_name: 'Alex',
            last_name: 'Recruiter',
            is_approved: data.is_approved ?? false,
          }),
        },
        recruiterVerification: {
          update: async ({ data }) => ({ id: 'verif-1', ...data }),
          create: async ({ data }) => ({ id: 'verif-1', ...data }),
        },
        company: {
          findUnique: async () => ({ id: validCompanyId, name: 'Acme Corp' }),
          findMany: async () => [],
          update: async () => ({ id: validCompanyId, name: 'Acme Corp' }),
        },
      };

      adminRecruiterService = new AdminRecruiterService(
        mockPrisma,
        {},
        mockQueueService
      );
    });

    it('2.1 should enqueue clarification-requested email job with exact message', async () => {
      const clarificationText = 'Please provide certificate of incorporation with company stamp';
      await adminRecruiterService.requestClarification(validRecruiterId, {
        message: clarificationText,
      });

      assert.equal(sentJobs.length, 1);
      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS
      );
      assert.equal(job.data.recruiterId, validRecruiterId);
      assert.equal(job.data.status, 'NEEDS_CLARIFICATION');
      assert.equal(job.data.clarificationMessage, clarificationText);
      assert.ok(job.options.singletonKey.includes(validRecruiterId));
    });

    it('2.2 should enqueue approval email job when recruiter is approved', async () => {
      await adminRecruiterService.approveRecruiter(validRecruiterId);

      assert.equal(sentJobs.length, 1);
      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS
      );
      assert.equal(job.data.recruiterId, validRecruiterId);
      assert.equal(job.data.status, 'APPROVED');
      assert.equal(job.options.singletonKey, `recruiter-approved:${validRecruiterId}`);
    });

    it('2.3 should enqueue rejection email job with exact reason and eventId when recruiter is rejected', async () => {
      const rejectReason = 'Organization credentials could not be verified with registry';
      await adminRecruiterService.rejectRecruiter(validRecruiterId, {
        reason: rejectReason,
      });

      assert.equal(sentJobs.length, 1);
      const job = sentJobs[0];
      assert.equal(
        job.queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS
      );
      assert.equal(job.data.recruiterId, validRecruiterId);
      assert.equal(job.data.status, 'REJECTED');
      assert.equal(job.data.rejectionReason, rejectReason);
      assert.ok(typeof job.data.eventId === 'string' && job.data.eventId.length > 0);
      assert.equal(
        job.options.singletonKey,
        `recruiter-rejected:${validRecruiterId}:${job.data.eventId}`
      );
    });

    it('2.4 should not throw when queue fails during clarification request', async () => {
      mockQueueService.send = async () => {
        throw new Error('Queue unavailable');
      };

      const result = await adminRecruiterService.requestClarification(validRecruiterId, {
        message: 'More details needed',
      });

      assert.ok(result);
      assert.equal(result.status, 'NEEDS_CLARIFICATION');
    });

    it('2.5 should generate distinct event IDs and singleton keys for two sequential rejections of the same recruiter', async () => {
      await adminRecruiterService.rejectRecruiter(validRecruiterId, {
        reason: 'First rejection reason',
      });
      await adminRecruiterService.rejectRecruiter(validRecruiterId, {
        reason: 'Second rejection reason with updated findings',
      });

      assert.equal(sentJobs.length, 2);
      const [job1, job2] = sentJobs;

      assert.equal(job1.data.recruiterId, validRecruiterId);
      assert.equal(job2.data.recruiterId, validRecruiterId);

      assert.equal(job1.data.rejectionReason, 'First rejection reason');
      assert.equal(
        job2.data.rejectionReason,
        'Second rejection reason with updated findings'
      );

      assert.ok(job1.data.eventId);
      assert.ok(job2.data.eventId);
      assert.notEqual(job1.data.eventId, job2.data.eventId);

      assert.equal(
        job1.options.singletonKey,
        `recruiter-rejected:${validRecruiterId}:${job1.data.eventId}`
      );
      assert.equal(
        job2.options.singletonKey,
        `recruiter-rejected:${validRecruiterId}:${job2.data.eventId}`
      );
      assert.notEqual(job1.options.singletonKey, job2.options.singletonKey);
    });
  });

  // =========================================================================
  // 3. JobService Moderation Producer
  // =========================================================================
  describe('3. JobService — Moderation Producer', () => {
    let mockPrisma;
    let mockQueueService;
    let jobService;
    let sentJobs;

    beforeEach(() => {
      sentJobs = [];
      mockQueueService = {
        send: async (queueName, data, options) => {
          sentJobs.push({ queueName, data, options });
          return 'mock-job-id';
        },
      };

      mockPrisma = {
        job: {
          findUnique: async () => ({
            id: validJobId,
            recruiter_id: validRecruiterId,
            company_id: validCompanyId,
            title: 'Senior TypeScript Engineer',
            status: 'PENDING',
          }),
          update: async ({ data }) => ({
            id: validJobId,
            status: data.status,
          }),
        },
      };

      jobService = new JobService(
        mockPrisma,
        {},
        {},
        mockQueueService
      );
    });

    it('3.1 should enqueue job moderation job when status transitions to ACTIVE', async () => {
      const result = await jobService.moderateJobStatus(validJobId, {
        status: 'ACTIVE',
      });

      assert.equal(result.status, 'ACTIVE');
      assert.equal(sentJobs.length, 1);

      const job = sentJobs[0];
      assert.equal(job.queueName, QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION);
      assert.deepEqual(job.data, {
        jobId: validJobId,
        status: 'ACTIVE',
      });
      assert.equal(job.options.singletonKey, `job-moderation:${validJobId}:ACTIVE`);
    });

    it('3.2 should enqueue job moderation job when status transitions to REJECTED', async () => {
      const result = await jobService.moderateJobStatus(validJobId, {
        status: 'REJECTED',
      });

      assert.equal(result.status, 'REJECTED');
      assert.equal(sentJobs.length, 1);

      const job = sentJobs[0];
      assert.equal(job.queueName, QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION);
      assert.deepEqual(job.data, {
        jobId: validJobId,
        status: 'REJECTED',
      });
      assert.equal(job.options.singletonKey, `job-moderation:${validJobId}:REJECTED`);
    });

    it('3.3 should succeed without error if queue service fails (non-blocking)', async () => {
      mockQueueService.send = async () => {
        throw new Error('Queue down');
      };

      const result = await jobService.moderateJobStatus(validJobId, {
        status: 'ACTIVE',
      });

      assert.ok(result);
      assert.equal(result.status, 'ACTIVE');
    });
  });

  // =========================================================================
  // 4. NotificationEmailWorker Dispatch & Templates
  // =========================================================================
  describe('4. NotificationEmailWorker — Dispatch & Content Verification', () => {
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
        sendEmail: async (opts) => {
          dispatchedEmails.push(opts);
          return { success: true, messageId: 'msg-test-123' };
        },
      };

      mockPrisma = {
        recruiter: {
          findUnique: async () => ({
            id: validRecruiterId,
            user_id: validUserId,
            first_name: 'Jane',
            last_name: 'Doe',
            company: { name: 'Tech Solutions Inc' },
            user: { email: 'jane.doe@techsolutions.com', is_banned: false },
            verification: {
              organization_name: 'Tech Solutions Inc',
              status: 'PENDING',
              clarification_message: 'Please provide company registration',
              rejection_reason: 'Incomplete business documents',
              reviewed_at: new Date(1700000000000),
              updated_at: new Date(1700000000000),
            },
          }),
        },
        job: {
          findUnique: async () => ({
            id: validJobId,
            title: 'Full Stack Developer',
            company: { name: 'Tech Solutions Inc' },
            recruiter: {
              first_name: 'Jane',
              last_name: 'Doe',
              user: { email: 'jane.doe@techsolutions.com', is_banned: false },
            },
          }),
        },
        emailDelivery: {
          findUnique: async () => null,
          create: async ({ data }) => ({ ...data, id: 'deliv-1' }),
          update: async () => ({}),
        },
      };

      worker = new NotificationEmailWorker(
        mockQueueService,
        mockPrisma,
        mockEmailService
      );
    });

    it('4.1 handleRecruiterVerificationSubmittedJob: formats initial submission confirmation', async () => {
      await worker.handleRecruiterVerificationSubmittedJob({
        id: 'job-sub-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED,
        data: { recruiterId: validRecruiterId, isResubmission: false },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Organization Verification Submitted: Tech Solutions Inc/);
      assert.match(email.text, /Hello Jane Doe/);
      assert.match(email.text, /review your credentials shortly/);
      assert.match(email.html, /Verification Details Received/);
      assert.equal(email.idempotencyKey, `email:recruiter-verif-sub:${validRecruiterId}`);
    });

    it('4.2 handleRecruiterVerificationSubmittedJob: formats resubmission confirmation', async () => {
      await worker.handleRecruiterVerificationSubmittedJob({
        id: 'job-sub-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED,
        data: { recruiterId: validRecruiterId, isResubmission: true },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Organization Verification Resubmitted: Tech Solutions Inc/);
      assert.match(email.text, /re-evaluate your organization profile/);
      assert.match(email.html, /Verification Details Resubmitted/);
      assert.ok(email.idempotencyKey.includes('recruiter-verif-resub'));
    });

    it('4.3 handleRecruiterVerificationStatusJob: formats clarification request with message and HTML escaping', async () => {
      const rawMessage = 'Please submit "Certificate <A&B>" for review';
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-clarif-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'NEEDS_CLARIFICATION',
          clarificationMessage: rawMessage,
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Action Required: Clarification requested for Tech Solutions Inc/);
      assert.match(email.text, /Please submit "Certificate <A&B>" for review/);
      // HTML escaping: <, >, &, " must be escaped
      assert.ok(email.html.includes('&lt;A&amp;B&gt;'));
      assert.ok(!email.html.includes('<A&B>'));
    });

    it('4.4 handleRecruiterVerificationStatusJob: formats approval notification', async () => {
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-appr-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'APPROVED',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Congratulations! Tech Solutions Inc has been verified/);
      assert.match(email.text, /full access to post job openings/);
      assert.match(email.html, /Organization Verification Approved!/);
      assert.equal(email.idempotencyKey, `email:recruiter-approved:${validRecruiterId}`);
    });

    it('4.5 handleRecruiterVerificationStatusJob: formats rejection notification with reason', async () => {
      const rejectReason = 'Tax ID does not match registered company entity';
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-rej-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'REJECTED',
          rejectionReason: rejectReason,
          eventId: 'evt-rej-test-45',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Update on your organization verification for Tech Solutions Inc/);
      assert.match(email.text, /Tax ID does not match registered company entity/);
      assert.match(email.html, /Tax ID does not match registered company entity/);
      assert.equal(
        email.idempotencyKey,
        'email:recruiter-rejected:evt-rej-test-45'
      );
    });

    it('4.6 handleJobModerationJob: formats job approval notification (ACTIVE)', async () => {
      await worker.handleJobModerationJob({
        id: 'job-mod-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION,
        data: {
          jobId: validJobId,
          status: 'ACTIVE',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Job Approved: "Full Stack Developer" is now live on CareerForge/);
      assert.match(email.text, /approved by our moderation team/);
      assert.match(email.html, /Job Posting Approved!/);
      assert.equal(email.idempotencyKey, `email:job-mod:${validJobId}:ACTIVE`);
    });

    it('4.7 handleJobModerationJob: formats job rejection notification with reason (REJECTED)', async () => {
      const reason = 'Job description contains prohibited external links';
      await worker.handleJobModerationJob({
        id: 'job-mod-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION,
        data: {
          jobId: validJobId,
          status: 'REJECTED',
          reason,
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.equal(email.to, 'jane.doe@techsolutions.com');
      assert.match(email.subject, /Update on your job posting: "Full Stack Developer"/);
      assert.match(email.text, /Job description contains prohibited external links/);
      assert.match(email.html, /Job description contains prohibited external links/);
      assert.equal(email.idempotencyKey, `email:job-mod:${validJobId}:REJECTED`);
    });

    it('4.8 should skip delivery if recipient user is banned', async () => {
      mockPrisma.recruiter.findUnique = async () => ({
        id: validRecruiterId,
        user_id: validUserId,
        first_name: 'Banned',
        last_name: 'Recruiter',
        company: { name: 'Banned Corp' },
        user: { email: 'banned@example.com', is_banned: true },
        verification: null,
      });

      await worker.handleRecruiterVerificationSubmittedJob({
        id: 'job-banned',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED,
        data: { recruiterId: validRecruiterId },
      });

      assert.equal(dispatchedEmails.length, 0);
    });

    it('4.9 should skip delivery if recipient email is invalid or missing', async () => {
      mockPrisma.recruiter.findUnique = async () => ({
        id: validRecruiterId,
        user_id: validUserId,
        first_name: 'NoEmail',
        last_name: 'Recruiter',
        company: null,
        user: { email: 'invalid-email-format', is_banned: false },
        verification: null,
      });

      await worker.handleRecruiterVerificationSubmittedJob({
        id: 'job-no-email',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED,
        data: { recruiterId: validRecruiterId },
      });

      assert.equal(dispatchedEmails.length, 0);
    });

    it('4.10 should skip delivery if email with identical idempotency key was already SENT', async () => {
      mockPrisma.emailDelivery.findUnique = async () => ({
        id: 'deliv-sent',
        idempotency_key: `email:recruiter-approved:${validRecruiterId}`,
        status: 'SENT',
        message_id: 'prev-sent-msg-1',
      });

      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-dup',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'APPROVED',
        },
      });

      assert.equal(dispatchedEmails.length, 0);
    });

    it('4.11 should strictly escape HTML in user-controlled job title and company name', async () => {
      mockPrisma.job.findUnique = async () => ({
        id: validJobId,
        title: '<script>alert("xss")</script> Engineer',
        company: { name: '<b>Bold Co & Partners</b>' },
        recruiter: {
          first_name: 'John',
          last_name: 'O\'Connor',
          user: { email: 'john@boldco.com', is_banned: false },
        },
      });

      await worker.handleJobModerationJob({
        id: 'job-xss',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_JOB_MODERATION,
        data: {
          jobId: validJobId,
          status: 'ACTIVE',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      const email = dispatchedEmails[0];
      assert.ok(!email.html.includes('<script>'));
      assert.ok(email.html.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'));
      assert.ok(!email.html.includes('<b>Bold Co'));
      assert.ok(email.html.includes('&lt;b&gt;Bold Co &amp; Partners&lt;/b&gt;'));
      assert.ok(email.html.includes('O&#39;Connor'));
    });

    it('4.12 should stably reuse the same rejection eventId across retries and prevent duplicate sending', async () => {
      const stableEventId = 'evt-rejection-stable-uuid-111';
      const expectedKey = `email:recruiter-rejected:${stableEventId}`;

      // 1. First attempt: simulate email delivery table storing the SENT record
      const deliveryStore = new Map();
      mockPrisma.emailDelivery = {
        findUnique: async ({ where }) => deliveryStore.get(where.idempotency_key) || null,
        create: async ({ data }) => {
          const record = { ...data, id: 'deliv-rej-1' };
          deliveryStore.set(data.idempotency_key, record);
          return record;
        },
        update: async ({ where, data }) => {
          const existing = deliveryStore.get(where.idempotency_key) || {};
          const updated = { ...existing, ...data };
          deliveryStore.set(where.idempotency_key, updated);
          return updated;
        },
      };

      // Initial execution
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-rej-attempt-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'REJECTED',
          rejectionReason: 'Invalid documentation',
          eventId: stableEventId,
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(dispatchedEmails[0].idempotencyKey, expectedKey);
      const savedRecord = deliveryStore.get(expectedKey);
      assert.ok(savedRecord);
      assert.equal(savedRecord.status, 'SENT');

      // 2. Retry execution of the exact same job (pg-boss re-delivers the job payload with identical eventId)
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-rej-attempt-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'REJECTED',
          rejectionReason: 'Invalid documentation',
          eventId: stableEventId,
        },
      });

      // No new email dispatched on retry because key was identical and marked SENT
      assert.equal(dispatchedEmails.length, 1);
    });

    it('4.13 should deliver separate emails with distinct eventIds and reasons for subsequent rejections', async () => {
      const eventId1 = 'evt-rejection-first-uuid-111';
      const eventId2 = 'evt-rejection-second-uuid-222';

      const deliveryStore = new Map();
      mockPrisma.emailDelivery = {
        findUnique: async ({ where }) => deliveryStore.get(where.idempotency_key) || null,
        create: async ({ data }) => {
          const record = { ...data, id: `deliv-${deliveryStore.size + 1}` };
          deliveryStore.set(data.idempotency_key, record);
          return record;
        },
        update: async ({ where, data }) => {
          const existing = deliveryStore.get(where.idempotency_key) || {};
          const updated = { ...existing, ...data };
          deliveryStore.set(where.idempotency_key, updated);
          return updated;
        },
      };

      // 1. First rejection event
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-rej-round-1',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'REJECTED',
          rejectionReason: 'Missing registration certificate',
          eventId: eventId1,
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(
        dispatchedEmails[0].idempotencyKey,
        `email:recruiter-rejected:${eventId1}`
      );
      assert.match(dispatchedEmails[0].text, /Missing registration certificate/);

      // 2. Database state changes because Event B committed in the DB
      mockPrisma.recruiter.findUnique = async () => ({
        id: validRecruiterId,
        user_id: validUserId,
        first_name: 'Jane',
        last_name: 'Doe',
        company: { name: 'Tech Solutions Inc' },
        user: { email: 'jane.doe@techsolutions.com', is_banned: false },
        verification: {
          organization_name: 'Tech Solutions Inc',
          status: 'REJECTED',
          rejection_reason: 'Submitted license expired and signature unverifiable',
          reviewed_at: new Date(1700003600000),
          updated_at: new Date(1700003600000),
        },
      });

      // 3. Second rejection event processes
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-rej-round-2',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'REJECTED',
          rejectionReason: 'Submitted license expired and signature unverifiable',
          eventId: eventId2,
        },
      });

      // Second email must be sent because the new key is not suppressed by the first
      assert.equal(dispatchedEmails.length, 2);
      assert.equal(
        dispatchedEmails[1].idempotencyKey,
        `email:recruiter-rejected:${eventId2}`
      );
      assert.match(
        dispatchedEmails[1].text,
        /Submitted license expired and signature unverifiable/
      );
      assert.notEqual(
        dispatchedEmails[0].idempotencyKey,
        dispatchedEmails[1].idempotencyKey
      );
    });

    it('4.14 should fall back to recruiterId when eventId is omitted without live DB timestamp reliance', async () => {
      await worker.handleRecruiterVerificationStatusJob({
        id: 'job-rej-fallback',
        name: QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_STATUS,
        data: {
          recruiterId: validRecruiterId,
          status: 'REJECTED',
          rejectionReason: 'Fallback rejection without eventId',
        },
      });

      assert.equal(dispatchedEmails.length, 1);
      assert.equal(
        dispatchedEmails[0].idempotencyKey,
        `email:recruiter-rejected:${validRecruiterId}`
      );
    });
  });
});
