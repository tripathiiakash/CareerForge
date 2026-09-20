const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  UserRole,
  EmploymentType,
  JobStatus,
  ApplicationStatus,
  AnalysisStatus,
  Prisma,
} = require('@prisma/client');
const {
  createTestPrisma,
  assertDatabaseReachable,
  assertMigrationsApplied,
  getTestDatabaseUrl,
} = require('./setup/db-test-harness');
const { ApplicationService } = require('../dist/modules/application/application.service');
const { ResumeAnalysisService } = require('../dist/modules/resume/services/resume-analysis.service');
const { StudentService } = require('../dist/modules/student/student.service');
const { QueueService } = require('../dist/core/queue/queue.service');
const { QUEUE_NAMES } = require('../dist/core/queue/queue.types');

describe('Database Concurrency & Unique-Constraint Integration Suite (Phase 6.6-E2)', () => {
  const suiteRunId = crypto.randomBytes(4).toString('hex');
  const testDatabaseUrl = getTestDatabaseUrl()
    .replace('@localhost:', '@127.0.0.1:')
    .replace('://localhost:', '://127.0.0.1:');

  let prisma;
  let queueService;

  // Track all created entity IDs for clean, FK-safe teardown
  const createdUserIds = [];
  const createdCompanyIds = [];
  const createdJobIds = [];
  const createdStudentIds = [];
  const createdRecruiterIds = [];
  const createdResumeIds = [];
  const createdAppIds = [];
  const createdEmailKeys = [];
  const createdSingletonKeys = [];

  // Mock QueueService for ApplicationService so we do not spam pg-boss during application races
  const mockQueueService = {
    send: async () => 'mock-queue-job-id',
  };

  before(async () => {
    // Safety check: creates client strictly against TEST_DATABASE_URL
    prisma = createTestPrisma();
    await assertDatabaseReachable(prisma);
    await assertMigrationsApplied(prisma);

    // Initialize real QueueService connected to TEST_DATABASE_URL
    queueService = new QueueService({
      databaseUrl: testDatabaseUrl,
      pgBossSchema: 'pgboss',
    });
    await queueService.onModuleInit();
  });

  after(async () => {
    // Gracefully stop QueueService
    if (queueService) {
      try {
        await queueService.onModuleDestroy();
      } catch (err) {
        console.error('Error stopping QueueService in after():', err.message);
      }
    }

    // Teardown created test entities in FK-safe order
    if (prisma) {
      try {
        if (createdAppIds.length > 0) {
          await prisma.application.deleteMany({
            where: { id: { in: createdAppIds } },
          });
        }
        if (createdResumeIds.length > 0) {
          await prisma.aiAnalysis.deleteMany({
            where: { resume_id: { in: createdResumeIds } },
          });
          await prisma.resume.deleteMany({
            where: { id: { in: createdResumeIds } },
          });
        }
        if (createdJobIds.length > 0) {
          await prisma.job.deleteMany({
            where: { id: { in: createdJobIds } },
          });
        }
        if (createdStudentIds.length > 0) {
          await prisma.student.deleteMany({
            where: { id: { in: createdStudentIds } },
          });
        }
        if (createdRecruiterIds.length > 0) {
          await prisma.recruiter.deleteMany({
            where: { id: { in: createdRecruiterIds } },
          });
        }
        if (createdCompanyIds.length > 0) {
          await prisma.company.deleteMany({
            where: { id: { in: createdCompanyIds } },
          });
        }
        if (createdUserIds.length > 0) {
          await prisma.user.deleteMany({
            where: { id: { in: createdUserIds } },
          });
        }
        if (createdEmailKeys.length > 0) {
          await prisma.emailDelivery.deleteMany({
            where: { idempotency_key: { in: createdEmailKeys } },
          });
        }
        if (createdSingletonKeys.length > 0) {
          await prisma.$queryRawUnsafe(
            'DELETE FROM pgboss.job WHERE singleton_key = ANY($1::text[])',
            createdSingletonKeys
          );
        }
      } catch (err) {
        console.error('Error in after() cleanup:', err.message);
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  // Helper to create a complete student fixture
  async function createStudentFixture(prefix = 'stud') {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suiteRunId}-${crypto.randomUUID()}@example.com`,
        password_hash: 'hashed_pw',
        role: UserRole.STUDENT,
      },
    });
    createdUserIds.push(user.id);

    const student = await prisma.student.create({
      data: {
        user_id: user.id,
        first_name: 'Test',
        last_name: 'Student',
      },
    });
    createdStudentIds.push(student.id);

    const resume = await prisma.resume.create({
      data: {
        student_id: student.id,
        file_url: 'https://example.com/test-resume.pdf',
        is_primary: true,
      },
    });
    createdResumeIds.push(resume.id);

    return { user, student, resume };
  }

  // Helper to create a recruiter + company + jobs fixture
  async function createRecruiterAndJobsFixture(jobCount = 1, prefix = 'rec') {
    const company = await prisma.company.create({
      data: {
        name: `Company-${prefix}-${suiteRunId}-${crypto.randomUUID().slice(0, 8)}`,
      },
    });
    createdCompanyIds.push(company.id);

    const recruiterUser = await prisma.user.create({
      data: {
        email: `${prefix}-${suiteRunId}-${crypto.randomUUID()}@example.com`,
        password_hash: 'hashed_pw',
        role: UserRole.RECRUITER,
      },
    });
    createdUserIds.push(recruiterUser.id);

    const recruiter = await prisma.recruiter.create({
      data: {
        user_id: recruiterUser.id,
        company_id: company.id,
        first_name: 'RecruiterFirst',
        last_name: 'RecruiterLast',
      },
    });
    createdRecruiterIds.push(recruiter.id);

    const jobs = [];
    for (let i = 0; i < jobCount; i++) {
      const job = await prisma.job.create({
        data: {
          recruiter_id: recruiter.id,
          company_id: company.id,
          title: `Job ${i + 1} (${prefix})`,
          description: 'Job description for concurrency tests',
          required_skills: ['TypeScript', 'PostgreSQL'],
          employment_type: EmploymentType.FULL_TIME,
          status: JobStatus.ACTIVE,
        },
      });
      createdJobIds.push(job.id);
      jobs.push(job);
    }

    return { recruiterUser, recruiter, company, jobs };
  }

  // =========================================================================
  // TEST A: APPLICATION QUOTA RACE (Section 6)
  // =========================================================================
  describe('Test A: Application Quota Race Condition Protection', () => {
    it('should strictly enforce MAX_APPLICATIONS_PER_STUDENT under concurrent submissions via SELECT FOR UPDATE', async () => {
      const { user, student, resume } = await createStudentFixture('quota-stud');
      const { jobs } = await createRecruiterAndJobsFixture(4, 'quota-jobs');

      // Test configuration: student can submit at most 3 applications
      const MAX_APPLICATIONS = 3;
      const testConfig = { maxApplicationsPerStudent: MAX_APPLICATIONS };
      const appService = new ApplicationService(
        prisma,
        mockQueueService,
        testConfig
      );

      // Precondition: fill quota so exactly ONE application slot remains (2 applications existing)
      const existingApp1 = await prisma.application.create({
        data: {
          job_id: jobs[0].id,
          student_id: student.id,
          resume_id: resume.id,
        },
      });
      createdAppIds.push(existingApp1.id);

      const existingApp2 = await prisma.application.create({
        data: {
          job_id: jobs[1].id,
          student_id: student.id,
          resume_id: resume.id,
        },
      });
      createdAppIds.push(existingApp2.id);

      const countBefore = await prisma.application.count({
        where: { student_id: student.id },
      });
      assert.equal(countBefore, 2, 'Precondition: student must have exactly 2 existing applications');

      // Execute two simultaneous applyToJob calls for two distinct active jobs (jobs[2] and jobs[3])
      const jobA = jobs[2];
      const jobB = jobs[3];

      const results = await Promise.allSettled([
        appService.applyToJob(user.id, jobA.id, { resume_id: resume.id }),
        appService.applyToJob(user.id, jobB.id, { resume_id: resume.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Assert concurrency outcomes:
      // Exactly one submission must succeed
      assert.equal(
        fulfilled.length,
        1,
        'Expected exactly one concurrent application to succeed'
      );
      assert.equal(fulfilled[0].value.status, 'APPLIED');
      createdAppIds.push(fulfilled[0].value.application_id);

      // Exactly one submission must be rejected due to exhausted quota
      assert.equal(
        rejected.length,
        1,
        'Expected exactly one concurrent application to be rejected'
      );
      const rejectionError = rejected[0].reason;
      assert.equal(
        rejectionError.getStatus?.() ?? rejectionError.status,
        400,
        'Rejection must be HTTP 400 BadRequestException'
      );
      const errorResponse = rejectionError.getResponse?.() ?? rejectionError;
      assert.equal(
        errorResponse.code,
        'VALIDATION_ERROR',
        'Rejection code must be VALIDATION_ERROR'
      );
      assert.match(
        errorResponse.message,
        /Maximum application limit of 3 reached/,
        'Rejection message must indicate maximum application quota reached'
      );

      // Final Database Invariant: count for the student must equal MAX_APPLICATIONS (3) and never exceed it
      const countAfter = await prisma.application.count({
        where: { student_id: student.id },
      });
      assert.equal(
        countAfter,
        MAX_APPLICATIONS,
        `Final application count must strictly equal ${MAX_APPLICATIONS}`
      );
    });

    it('database concurrency invariant: row lock on students blocks concurrent transaction until first commits', async () => {
      const { student } = await createStudentFixture('lock-test');

      let lockAcquiredByTx1 = false;
      let tx1Committed = false;
      let tx2ObservedTx1Committed = false;

      // Transaction 1: acquires row lock and holds it for a short synchronized duration
      const tx1Promise = prisma.$transaction(
        async (tx1) => {
          await tx1.$queryRaw`SELECT id FROM students WHERE id = ${student.id}::uuid FOR UPDATE`;
          lockAcquiredByTx1 = true;
          // Hold lock for 100ms
          await new Promise((resolve) => setTimeout(resolve, 100));
          tx1Committed = true;
          return 'tx1-done';
        },
        { maxWait: 10000, timeout: 10000 }
      );

      // Wait until Tx 1 has acquired the lock before launching Tx 2
      while (!lockAcquiredByTx1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // Transaction 2: attempts to acquire the exact same student row lock
      const tx2Promise = prisma.$transaction(
        async (tx2) => {
          // Must block until Tx 1 finishes and commits
          await tx2.$queryRaw`SELECT id FROM students WHERE id = ${student.id}::uuid FOR UPDATE`;
          tx2ObservedTx1Committed = tx1Committed;
          return 'tx2-done';
        },
        { maxWait: 10000, timeout: 10000 }
      );

      const [res1, res2] = await Promise.all([tx1Promise, tx2Promise]);
      assert.equal(res1, 'tx1-done');
      assert.equal(res2, 'tx2-done');
      assert.equal(
        tx2ObservedTx1Committed,
        true,
        'Tx 2 must only acquire the row lock after Tx 1 has released it'
      );
    });
  });

  // =========================================================================
  // TEST B: REAL DUPLICATE APPLICATION RACE (Section 7)
  // =========================================================================
  describe('Test B: Real Duplicate Application Race Condition Protection', () => {
    it('should reject simultaneous submissions to the same job with 409 ConflictException via ApplicationService', async () => {
      const { user, student, resume } = await createStudentFixture('dup-stud');
      const { jobs } = await createRecruiterAndJobsFixture(1, 'dup-jobs');
      const targetJob = jobs[0];

      const appService = new ApplicationService(prisma, mockQueueService);

      // Execute two simultaneous applications to the exact same job
      const results = await Promise.allSettled([
        appService.applyToJob(user.id, targetJob.id, { resume_id: resume.id }),
        appService.applyToJob(user.id, targetJob.id, { resume_id: resume.id }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(
        fulfilled.length,
        1,
        'Expected exactly one application to succeed'
      );
      assert.equal(fulfilled[0].value.status, 'APPLIED');
      createdAppIds.push(fulfilled[0].value.application_id);

      assert.equal(
        rejected.length,
        1,
        'Expected exactly one application to be rejected with 409 CONFLICT'
      );
      const conflictError = rejected[0].reason;
      assert.equal(
        conflictError.getStatus?.() ?? conflictError.status,
        409,
        'Rejection must be HTTP 409 ConflictException'
      );
      const errorResponse = conflictError.getResponse?.() ?? conflictError;
      assert.equal(errorResponse.code, 'CONFLICT');
      assert.match(
        errorResponse.message,
        /Student has already applied to this job/
      );

      // Final Database Invariant: exactly one Application row exists for this student/job pair
      const appCount = await prisma.application.count({
        where: {
          job_id: targetJob.id,
          student_id: student.id,
        },
      });
      assert.equal(
        appCount,
        1,
        'Database must contain strictly one Application record for student and job'
      );
    });

    it('database engine constraint proof: direct concurrent Prisma creates trigger PostgreSQL P2002 unique violation', async () => {
      const { student, resume } = await createStudentFixture('p2002-stud');
      const { jobs } = await createRecruiterAndJobsFixture(1, 'p2002-jobs');
      const targetJob = jobs[0];

      // Bypass ApplicationService and fire two concurrent raw Prisma creates for the exact same (job_id, student_id)
      const create1 = prisma.application.create({
        data: {
          job_id: targetJob.id,
          student_id: student.id,
          resume_id: resume.id,
        },
      });
      const create2 = prisma.application.create({
        data: {
          job_id: targetJob.id,
          student_id: student.id,
          resume_id: resume.id,
        },
      });

      const results = await Promise.allSettled([create1, create2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(
        fulfilled.length,
        1,
        'Exactly one direct Prisma create must succeed'
      );
      createdAppIds.push(fulfilled[0].value.id);

      assert.equal(
        rejected.length,
        1,
        'Exactly one direct Prisma create must be rejected by PostgreSQL engine'
      );
      const dbError = rejected[0].reason;

      // Verify the rejection is a genuine Prisma P2002 originating from PostgreSQL unique index
      assert.ok(
        dbError instanceof Prisma.PrismaClientKnownRequestError,
        'Error must be PrismaClientKnownRequestError'
      );
      assert.equal(
        dbError.code,
        'P2002',
        'Error code must be P2002 (unique constraint violation)'
      );
      assert.deepEqual(
        dbError.meta?.target,
        ['job_id', 'student_id'],
        'P2002 violation target must be [job_id, student_id]'
      );

      // Verify final database state
      const count = await prisma.application.count({
        where: {
          job_id: targetJob.id,
          student_id: student.id,
        },
      });
      assert.equal(count, 1, 'Database must contain strictly 1 application row');
    });
  });

  // =========================================================================
  // TEST C: REAL EMAIL DELIVERY UNIQUE-CONSTRAINT RACE (Section 8)
  // =========================================================================
  describe('Test C: Real EmailDelivery Unique-Constraint Race', () => {
    it('should enforce @@unique([idempotency_key]) on EmailDelivery under concurrent execution', async () => {
      const testKey = `test-email-idem-${suiteRunId}-${crypto.randomUUID()}`;
      createdEmailKeys.push(testKey);

      // Concurrently execute two real Prisma creates with identical idempotency_key
      const insertA = prisma.emailDelivery.create({
        data: {
          idempotency_key: testKey,
          event_type: 'APPLICATION_SUBMITTED_STUDENT',
          recipient_email: 'student@example.com',
          subject: 'Your Application Was Submitted',
          body_text: 'Confirmation content',
          status: 'PENDING',
        },
      });

      const insertB = prisma.emailDelivery.create({
        data: {
          idempotency_key: testKey,
          event_type: 'APPLICATION_SUBMITTED_STUDENT',
          recipient_email: 'student@example.com',
          subject: 'Your Application Was Submitted',
          body_text: 'Confirmation content',
          status: 'PENDING',
        },
      });

      const results = await Promise.allSettled([insertA, insertB]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.equal(
        fulfilled.length,
        1,
        'Expected exactly one concurrent EmailDelivery insert to succeed'
      );
      assert.equal(
        rejected.length,
        1,
        'Expected exactly one concurrent EmailDelivery insert to reject'
      );

      const dbError = rejected[0].reason;
      assert.ok(
        dbError instanceof Prisma.PrismaClientKnownRequestError,
        'Rejection must be a real PrismaClientKnownRequestError'
      );
      assert.equal(
        dbError.code,
        'P2002',
        'Rejection code must be P2002 unique constraint violation'
      );
      assert.deepEqual(
        dbError.meta?.target,
        ['idempotency_key'],
        'P2002 target must be idempotency_key'
      );

      // Invariant: Exactly one record exists in database for this key
      const count = await prisma.emailDelivery.count({
        where: { idempotency_key: testKey },
      });
      assert.equal(count, 1, 'Final database count for idempotency key must be 1');
    });
  });

  // =========================================================================
  // TEST D: PG-BOSS QUEUE PERSISTENCE & EXCLUSIVE POLICY (Section 9)
  // =========================================================================
  describe('Test D: PgBoss Queue Persistence & Exclusive Policy', () => {
    it('should register resume-ai-analysis with exclusive policy in pgboss.queue', async () => {
      // Query real pgboss.queue table in careerforge_test
      const queues = await prisma.$queryRaw`
        SELECT name, policy
        FROM pgboss.queue
        WHERE name = ${QUEUE_NAMES.RESUME_AI_ANALYSIS}
      `;

      assert.ok(Array.isArray(queues) && queues.length > 0, 'Queue must exist in pgboss.queue');
      assert.equal(
        queues[0].name,
        QUEUE_NAMES.RESUME_AI_ANALYSIS,
        'Queue name must match resume-ai-analysis'
      );
      assert.equal(
        queues[0].policy,
        'exclusive',
        'Queue policy must be configured as exclusive'
      );
    });

    it('should prevent duplicate active/created records for same singletonKey in pgboss.job', async () => {
      const testSingletonKey = `singleton-test-${suiteRunId}-${crypto.randomUUID()}`;
      createdSingletonKeys.push(testSingletonKey);

      // Send first job with singletonKey
      const jobId1 = await queueService.send(
        QUEUE_NAMES.RESUME_AI_ANALYSIS,
        { resumeId: 'test-resume-1' },
        { singletonKey: testSingletonKey }
      );

      assert.ok(
        typeof jobId1 === 'string' && jobId1.length > 0,
        'Initial send must succeed and return a non-empty job ID'
      );

      // Send duplicate job with identical singletonKey while the first is pending/created
      const jobId2 = await queueService.send(
        QUEUE_NAMES.RESUME_AI_ANALYSIS,
        { resumeId: 'test-resume-2' },
        { singletonKey: testSingletonKey }
      );

      // In pg-boss 12.31.0, duplicate submission with same singletonKey returns null
      assert.equal(
        jobId2,
        null,
        'Duplicate job send with same singletonKey must be dropped and return null'
      );

      // Direct inspection of pgboss.job table in PostgreSQL
      const jobsInDb = await prisma.$queryRaw`
        SELECT id, name, state, singleton_key, policy
        FROM pgboss.job
        WHERE singleton_key = ${testSingletonKey}
      `;

      assert.equal(
        jobsInDb.length,
        1,
        'Database must contain strictly one row for the singletonKey'
      );
      assert.equal(jobsInDb[0].id, jobId1);
      assert.equal(jobsInDb[0].name, QUEUE_NAMES.RESUME_AI_ANALYSIS);
      assert.equal(jobsInDb[0].state, 'created');
      assert.equal(jobsInDb[0].policy, 'exclusive');
    });

    it('Phase 6 Finding-05: stale recovery with existing singleton in pg-boss preserves created_at and does not reset recovery clock', async () => {
      const { user, student, resume } = await createStudentFixture('f05-dedup');
      await prisma.resume.update({
        where: { id: resume.id },
        data: { parsed_text: 'Sample valid resume text for AI analysis test' },
      });
      createdSingletonKeys.push(resume.id);

      // Create initial AiAnalysis in PROCESSING set 8 minutes ago (stale)
      const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000);
      await prisma.aiAnalysis.create({
        data: {
          resume_id: resume.id,
          status: AnalysisStatus.PROCESSING,
          created_at: eightMinutesAgo,
        },
      });

      // Send an exclusive pg-boss job with singletonKey = resume.id
      const initialJobId = await queueService.send(
        QUEUE_NAMES.RESUME_AI_ANALYSIS,
        { resumeId: resume.id, studentId: student.id },
        { singletonKey: resume.id }
      );
      assert.ok(initialJobId, 'Initial job must be created in pg-boss');

      const studentService = new StudentService(prisma);
      const analysisService = new ResumeAnalysisService(prisma, studentService, queueService);

      // Trigger stale recovery while job is still queued in pg-boss
      const result = await analysisService.triggerAnalysis(user.id, resume.id);
      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.resume_id, resume.id);

      // Verify in PostgreSQL that ai_analyses.created_at was NOT reset to NOW (Finding-05 contract)
      const recordAfter = await prisma.aiAnalysis.findUnique({
        where: { resume_id: resume.id },
      });
      assert.equal(
        recordAfter.created_at.getTime(),
        eightMinutesAgo.getTime(),
        'created_at must remain the original timestamp and not be overwritten when deduplicated against an active singleton'
      );

      // Verify that no duplicate job was created in pg-boss
      const jobsInQueue = await prisma.$queryRaw`
        SELECT id, state, singleton_key
        FROM pgboss.job
        WHERE singleton_key = ${resume.id}
      `;
      assert.equal(jobsInQueue.length, 1, 'Exactly one job must exist in pg-boss');
      assert.equal(jobsInQueue[0].id, initialJobId);
    });

    it('Phase 6 Finding-05: stale recovery with expired active job supervises and re-enqueues successfully', async () => {
      const { user, student, resume } = await createStudentFixture('f05-expire');
      await prisma.resume.update({
        where: { id: resume.id },
        data: { parsed_text: 'Sample valid resume text for AI analysis test' },
      });
      createdSingletonKeys.push(resume.id);

      // Create initial AiAnalysis in PROCESSING set 8 minutes ago (stale)
      const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000);
      await prisma.aiAnalysis.create({
        data: {
          resume_id: resume.id,
          status: AnalysisStatus.PROCESSING,
          created_at: eightMinutesAgo,
        },
      });

      // Send initial job with expireInSeconds: 2, retryLimit: 0 and simulate worker crash in 'active' state
      const initialJobId = await queueService.send(
        QUEUE_NAMES.RESUME_AI_ANALYSIS,
        { resumeId: resume.id, studentId: student.id },
        { singletonKey: resume.id, expireInSeconds: 2, retryLimit: 0 }
      );
      assert.ok(initialJobId);

      // Simulate worker crashed 10 seconds ago leaving job in 'active' state past its 2-second expiration
      await prisma.$executeRawUnsafe(
        `UPDATE pgboss.job SET state = 'active', started_on = now() - interval '10 seconds', expire_seconds = 2, retry_limit = 0 WHERE id = '${initialJobId}'::uuid`
      );
      // Ensure queue monitor cadence allows immediate supervision in this test
      await prisma.$executeRawUnsafe(
        `UPDATE pgboss.queue SET monitor_claim_on = now() - interval '10 minutes' WHERE name = '${QUEUE_NAMES.RESUME_AI_ANALYSIS}'`
      );

      const studentService = new StudentService(prisma);
      const analysisService = new ResumeAnalysisService(prisma, studentService, queueService);

      // Trigger stale recovery: should detect collision, supervise queue to transition expired job to failed, and re-enqueue a fresh job
      const result = await analysisService.triggerAnalysis(user.id, resume.id);
      assert.equal(result.status, 'PROCESSING');

      // Verify that a fresh job was enqueued and ai_analyses.created_at was refreshed to NOW
      const recordAfter = await prisma.aiAnalysis.findUnique({
        where: { resume_id: resume.id },
      });
      assert.ok(
        recordAfter.created_at.getTime() > eightMinutesAgo.getTime(),
        'created_at must be refreshed to a new timestamp because a new recovery job was successfully enqueued'
      );

      // Verify pg-boss states: old job is failed, new job is created
      const jobsInDb = await prisma.$queryRaw`
        SELECT id, state, singleton_key
        FROM pgboss.job
        WHERE singleton_key = ${resume.id}
        ORDER BY created_on ASC
      `;
      assert.equal(jobsInDb.length, 2, 'Should have old failed job and new created job');
      assert.equal(jobsInDb[0].id, initialJobId);
      assert.equal(jobsInDb[0].state, 'failed');
      assert.equal(jobsInDb[1].state, 'created');
    });
  });

  // =========================================================================
  // TEST E: REAL APPLICATION STATUS MUTATION CONCURRENCY RACE (FINDING-02)
  // =========================================================================
  describe('Test E: Real Application Status Mutation Concurrency Race (FINDING-02)', () => {
    it('should resolve concurrent conflicting status mutations atomically: exactly 1 wins, 1 receives 409, and only 1 email queued', async () => {
      const { student, resume } = await createStudentFixture('status-race-stud');
      const { recruiterUser, jobs } = await createRecruiterAndJobsFixture(1, 'status-race-jobs');
      const targetJob = jobs[0];

      // Create an application starting in APPLIED status
      const app = await prisma.application.create({
        data: {
          job_id: targetJob.id,
          student_id: student.id,
          resume_id: resume.id,
          status: ApplicationStatus.APPLIED,
        },
      });
      createdAppIds.push(app.id);

      const appService = new ApplicationService(prisma, queueService);

      // Concurrently execute conflicting mutations:
      // Request A: APPLIED -> REJECTED
      // Request B: APPLIED -> SHORTLISTED
      const results = await Promise.allSettled([
        appService.updateApplicationStatus(recruiterUser.id, app.id, { status: 'REJECTED' }),
        appService.updateApplicationStatus(recruiterUser.id, app.id, { status: 'SHORTLISTED' }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // 1. Exactly one mutation must succeed
      assert.equal(fulfilled.length, 1, 'Exactly one concurrent status mutation must succeed');
      const winningStatus = fulfilled[0].value.status;
      assert.ok(
        winningStatus === 'REJECTED' || winningStatus === 'SHORTLISTED',
        'Winning status must be REJECTED or SHORTLISTED'
      );

      // 2. Exactly one mutation must fail with 409 ConflictException
      assert.equal(rejected.length, 1, 'Exactly one concurrent status mutation must be rejected');
      const conflictError = rejected[0].reason;
      assert.equal(
        conflictError.getStatus?.() ?? conflictError.status,
        409,
        'Losing request must receive HTTP 409 CONFLICT'
      );
      const errResponse = conflictError.getResponse?.() ?? conflictError;
      assert.equal(errResponse.code, 'CONFLICT');
      assert.equal(
        errResponse.message,
        'Application status was modified by another request. Please refresh.'
      );

      // 3. Database state matches winning status
      const updatedInDb = await prisma.application.findUnique({
        where: { id: app.id },
      });
      assert.equal(
        updatedInDb.status,
        winningStatus,
        'Final application status in database must equal winning transition'
      );

      // 4. Verify queued notification in pg-boss: only 1 notification enqueued, matching winning status
      const queuedJobs = await prisma.$queryRaw`
        SELECT id, name, data->>'status' as status, singleton_key
        FROM pgboss.job
        WHERE name = ${QUEUE_NAMES.NOTIFICATION_EMAIL_APPLICATION_STATUS}
          AND data->>'applicationId' = ${app.id}
      `;
      assert.equal(
        queuedJobs.length,
        1,
        'Strictly one status email must be queued in pg-boss; losing transition must not enqueue'
      );
      assert.equal(
        queuedJobs[0].status,
        winningStatus,
        'Queued email status must strictly match winning transition'
      );
      if (queuedJobs[0].singleton_key) {
        createdSingletonKeys.push(queuedJobs[0].singleton_key);
      }

      // 5. Subsequent invalid transition from terminal state (if winningStatus was REJECTED) is rejected with 400
      if (winningStatus === 'REJECTED') {
        await assert.rejects(
          () =>
            appService.updateApplicationStatus(recruiterUser.id, app.id, { status: 'SHORTLISTED' }),
          (err) => {
            assert.equal(err.getStatus?.() ?? err.status, 400);
            const r = err.getResponse?.() ?? err;
            assert.equal(r.code, 'VALIDATION_ERROR');
            return true;
          }
        );
      } else {
        // If winningStatus was SHORTLISTED, sequential transition to REJECTED still works
        const seqResult = await appService.updateApplicationStatus(recruiterUser.id, app.id, { status: 'REJECTED' });
        assert.equal(seqResult.status, 'REJECTED');
      }
    });
  });

  // =========================================================================
  // CLEANUP VERIFICATION (Section 10)
  // =========================================================================
  describe('Cleanup Verification', () => {
    it('verifies test suite fixtures are isolated and cleanly tracked', () => {
      assert.ok(createdUserIds.length > 0, 'Fixtures were created during test run');
      assert.ok(createdCompanyIds.length > 0, 'Companies were created during test run');
      assert.ok(createdJobIds.length > 0, 'Jobs were created during test run');
    });
  });
});
