const { describe, it, after, before } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { UserRole, EmploymentType, JobStatus } = require('@prisma/client');
const {
  createTestPrisma,
  assertDatabaseReachable,
  assertMigrationsApplied,
} = require('./setup/db-test-harness');
const { AdminUserService } = require('../dist/modules/admin/admin-user.service');
const {
  PostgresInterviewPrepQuotaStore,
} = require('../dist/modules/job/quota/postgres-interview-prep-quota.store');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { Reflector } = require('@nestjs/core');
const {
  AdminUserController,
} = require('../dist/modules/admin/admin-user.controller');

describe('Phase 6.4-B: InterviewPrepLog Data-Lifecycle Hardening Suite', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdUserIds = [];
  const createdCompanyIds = [];

  let prisma;
  let adminUserService;
  let quotaStore;

  before(async () => {
    // Safety check: creates client strictly against TEST_DATABASE_URL
    prisma = createTestPrisma();
    await assertDatabaseReachable(prisma);
    await assertMigrationsApplied(prisma);

    adminUserService = new AdminUserService(prisma);
    quotaStore = new PostgresInterviewPrepQuotaStore(prisma);
  });

  after(async () => {
    // Cleanup any lingering test data on the isolated test database
    try {
      if (prisma && createdUserIds.length > 0) {
        await prisma.interviewPrepLog.deleteMany({
          where: {
            OR: [
              { student: { user_id: { in: createdUserIds } } },
              { job: { recruiter: { user_id: { in: createdUserIds } } } },
            ],
          },
        });
        await prisma.application.deleteMany({
          where: {
            OR: [
              { student: { user_id: { in: createdUserIds } } },
              { job: { recruiter: { user_id: { in: createdUserIds } } } },
            ],
          },
        });
        await prisma.aiAnalysis.deleteMany({
          where: { resume: { student: { user_id: { in: createdUserIds } } } },
        });
        await prisma.resume.deleteMany({
          where: { student: { user_id: { in: createdUserIds } } },
        });
        await prisma.job.deleteMany({
          where: { recruiter: { user_id: { in: createdUserIds } } },
        });
        await prisma.student.deleteMany({
          where: { user_id: { in: createdUserIds } },
        });
        await prisma.recruiter.deleteMany({
          where: { user_id: { in: createdUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
      if (prisma && createdCompanyIds.length > 0) {
        await prisma.company.deleteMany({
          where: { id: { in: createdCompanyIds } },
        });
      }
    } catch (_) {}

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // Helper to create a company
  async function createTestCompany(name = `Corp-${testRunId}-${Date.now()}`) {
    const comp = await prisma.company.create({
      data: { name },
    });
    createdCompanyIds.push(comp.id);
    return comp;
  }

  // Helper to create a user + profile
  async function createTestStudent(
    emailSuffix = crypto.randomBytes(4).toString('hex')
  ) {
    const user = await prisma.user.create({
      data: {
        email: `student-${testRunId}-${emailSuffix}@test.careerforge.internal`,
        password_hash: '$2b$10$abcdefghijklmnopqrstuu',
        role: UserRole.STUDENT,
        student: {
          create: {
            first_name: 'Test',
            last_name: 'Student',
          },
        },
      },
      include: { student: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createTestRecruiter(
    companyId,
    emailSuffix = crypto.randomBytes(4).toString('hex')
  ) {
    const user = await prisma.user.create({
      data: {
        email: `recruiter-${testRunId}-${emailSuffix}@test.careerforge.internal`,
        password_hash: '$2b$10$abcdefghijklmnopqrstuu',
        role: UserRole.RECRUITER,
        recruiter: {
          create: {
            first_name: 'Test',
            last_name: 'Recruiter',
            is_approved: true,
            company_id: companyId,
          },
        },
      },
      include: { recruiter: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createTestAdmin() {
    const user = await prisma.user.create({
      data: {
        email: `admin-${testRunId}-${crypto.randomBytes(4).toString('hex')}@test.careerforge.internal`,
        password_hash: '$2b$10$abcdefghijklmnopqrstuu',
        role: UserRole.ADMIN,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createTestJob(
    recruiterId,
    companyId,
    title = 'Software Engineer'
  ) {
    return prisma.job.create({
      data: {
        recruiter_id: recruiterId,
        company_id: companyId,
        title,
        description: 'Test job description with clean requirements.',
        required_skills: ['TypeScript', 'PostgreSQL'],
        employment_type: EmploymentType.FULL_TIME,
        status: JobStatus.ACTIVE,
      },
    });
  }

  describe('1. Relational Schema & Foreign-Key Constraints', () => {
    it('should verify database constraint delete_rule is CASCADE for student_id and job_id', async () => {
      const constraints = await prisma.$queryRawUnsafe(`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON rc.unique_constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'interview_prep_logs';
      `);

      const studentConstraint = constraints.find(
        (c) => c.column_name === 'student_id'
      );
      const jobConstraint = constraints.find((c) => c.column_name === 'job_id');

      assert.ok(studentConstraint, 'Constraint on student_id must exist');
      assert.equal(studentConstraint.foreign_table_name, 'students');
      assert.equal(studentConstraint.delete_rule, 'CASCADE');

      assert.ok(jobConstraint, 'Constraint on job_id must exist');
      assert.equal(jobConstraint.foreign_table_name, 'jobs');
      assert.equal(jobConstraint.delete_rule, 'CASCADE');
    });

    it('should link InterviewPrepLog to expected Student and Job entities', async () => {
      const company = await createTestCompany();
      const recruiter = await createTestRecruiter(company.id);
      const student = await createTestStudent();
      const job = await createTestJob(recruiter.recruiter.id, company.id);

      const log = await prisma.interviewPrepLog.create({
        data: {
          student_id: student.student.id,
          job_id: job.id,
        },
        include: {
          student: true,
          job: true,
        },
      });

      assert.equal(log.student_id, student.student.id);
      assert.equal(log.student.id, student.student.id);
      assert.equal(log.job_id, job.id);
      assert.equal(log.job.id, job.id);

      // Clean up log
      await prisma.interviewPrepLog.delete({ where: { id: log.id } });
    });
  });

  describe('2. Student Account Deletion Lifecycle (Integration)', () => {
    it('should explicitly delete InterviewPrepLog records when student is deleted by admin, leaving no orphans', async () => {
      const admin = await createTestAdmin();
      const company = await createTestCompany();
      const recruiter = await createTestRecruiter(company.id);
      const targetStudent = await createTestStudent();
      const otherStudent = await createTestStudent();
      const job = await createTestJob(recruiter.recruiter.id, company.id);

      // Create logs for target student
      const log1 = await prisma.interviewPrepLog.create({
        data: { student_id: targetStudent.student.id, job_id: job.id },
      });
      const log2 = await prisma.interviewPrepLog.create({
        data: { student_id: targetStudent.student.id, job_id: job.id },
      });

      // Create log for unrelated student
      const otherLog = await prisma.interviewPrepLog.create({
        data: { student_id: otherStudent.student.id, job_id: job.id },
      });

      // Admin deletes target student
      const result = await adminUserService.deleteUser(
        targetStudent.id,
        admin.id
      );
      assert.equal(result.message, 'User and associated data deleted.');

      // Verify target student user and student record no longer exist
      const userCheck = await prisma.user.findUnique({
        where: { id: targetStudent.id },
      });
      const studentCheck = await prisma.student.findUnique({
        where: { id: targetStudent.student.id },
      });
      assert.equal(userCheck, null);
      assert.equal(studentCheck, null);

      // Verify target student logs are completely deleted (no orphans)
      const targetLogsCount = await prisma.interviewPrepLog.count({
        where: { student_id: targetStudent.student.id },
      });
      assert.equal(targetLogsCount, 0);

      const log1Check = await prisma.interviewPrepLog.findUnique({
        where: { id: log1.id },
      });
      const log2Check = await prisma.interviewPrepLog.findUnique({
        where: { id: log2.id },
      });
      assert.equal(log1Check, null);
      assert.equal(log2Check, null);

      // Verify unrelated student's log is preserved intact
      const otherLogCheck = await prisma.interviewPrepLog.findUnique({
        where: { id: otherLog.id },
      });
      assert.ok(otherLogCheck, 'Unrelated student log must be preserved');
      assert.equal(otherLogCheck.student_id, otherStudent.student.id);
    });
  });

  describe('3. Recruiter Account Deletion Lifecycle (Integration)', () => {
    it('should explicitly delete InterviewPrepLog records for jobs owned by a deleted recruiter', async () => {
      const admin = await createTestAdmin();
      const company = await createTestCompany();
      const targetRecruiter = await createTestRecruiter(company.id);
      const otherRecruiter = await createTestRecruiter(company.id);
      const student = await createTestStudent();

      const targetJob = await createTestJob(
        targetRecruiter.recruiter.id,
        company.id,
        'Target Recruiter Job'
      );
      const otherJob = await createTestJob(
        otherRecruiter.recruiter.id,
        company.id,
        'Other Recruiter Job'
      );

      // Create log on target recruiter's job
      const targetJobLog = await prisma.interviewPrepLog.create({
        data: { student_id: student.student.id, job_id: targetJob.id },
      });

      // Create log on other recruiter's job
      const otherJobLog = await prisma.interviewPrepLog.create({
        data: { student_id: student.student.id, job_id: otherJob.id },
      });

      // Admin deletes target recruiter
      const result = await adminUserService.deleteUser(
        targetRecruiter.id,
        admin.id
      );
      assert.equal(result.message, 'User and associated data deleted.');

      // Verify target job and its logs are gone
      const targetJobCheck = await prisma.job.findUnique({
        where: { id: targetJob.id },
      });
      assert.equal(targetJobCheck, null);

      const targetJobLogCheck = await prisma.interviewPrepLog.findUnique({
        where: { id: targetJobLog.id },
      });
      assert.equal(targetJobLogCheck, null);

      // Verify unrelated job and its log remain intact
      const otherJobCheck = await prisma.job.findUnique({
        where: { id: otherJob.id },
      });
      assert.ok(otherJobCheck, 'Other job must be preserved');

      const otherJobLogCheck = await prisma.interviewPrepLog.findUnique({
        where: { id: otherJobLog.id },
      });
      assert.ok(otherJobLogCheck, 'Other job log must be preserved');
      assert.equal(otherJobLogCheck.job_id, otherJob.id);
    });
  });

  describe('4. Transaction Atomicity & Failure Rollback', () => {
    it('should roll back completely and keep InterviewPrepLog if transaction fails midway', async () => {
      const admin = await createTestAdmin();
      const company = await createTestCompany();
      const recruiter = await createTestRecruiter(company.id);
      const student = await createTestStudent();
      const job = await createTestJob(recruiter.recruiter.id, company.id);

      const log = await prisma.interviewPrepLog.create({
        data: { student_id: student.student.id, job_id: job.id },
      });

      // Mock prisma wrapper where tx.user.delete fails midway
      const mockPrisma = {
        user: {
          findUnique: async (args) => prisma.user.findUnique(args),
        },
        $transaction: async (fn) => {
          return prisma.$transaction(async (tx) => {
            // Intentionally intercept tx.user.delete to throw an error after interviewPrepLog is deleted
            tx.user.delete = async () => {
              throw new Error('SIMULATED_TRANSACTION_FAILURE');
            };
            return fn(tx);
          });
        },
      };

      const customService = new AdminUserService(mockPrisma);

      await assert.rejects(
        () => customService.deleteUser(student.id, admin.id),
        (err) => err.message === 'SIMULATED_TRANSACTION_FAILURE'
      );

      // Verify that the rollback preserved the user, student, and InterviewPrepLog record
      const userStillExists = await prisma.user.findUnique({
        where: { id: student.id },
      });
      assert.ok(userStillExists, 'User must still exist after rollback');

      const studentStillExists = await prisma.student.findUnique({
        where: { id: student.student.id },
      });
      assert.ok(studentStillExists, 'Student must still exist after rollback');

      const logStillExists = await prisma.interviewPrepLog.findUnique({
        where: { id: log.id },
      });
      assert.ok(
        logStillExists,
        'InterviewPrepLog must still exist after rollback'
      );
    });
  });

  describe('5. Role Authorization & Guard Enforcement', () => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);

    const createMockContext = (user) => ({
      switchToHttp: () => ({
        getRequest: () => (user ? { user } : {}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminUserController,
    });

    it('should reject unauthenticated caller from deleteUser route', () => {
      assert.throws(
        () => guard.canActivate(createMockContext(null)),
        (err) => err.status === 403
      );
    });

    it('should reject STUDENT caller from deleteUser route', () => {
      assert.throws(
        () =>
          guard.canActivate(
            createMockContext({ userId: 'student-id', role: 'STUDENT' })
          ),
        (err) => err.status === 403
      );
    });

    it('should reject RECRUITER caller from deleteUser route', () => {
      assert.throws(
        () =>
          guard.canActivate(
            createMockContext({ userId: 'recruiter-id', role: 'RECRUITER' })
          ),
        (err) => err.status === 403
      );
    });

    it('should permit ADMIN caller to access deleteUser route', () => {
      const allowed = guard.canActivate(
        createMockContext({ userId: 'admin-id', role: 'ADMIN' })
      );
      assert.equal(allowed, true);
    });
  });

  describe('6. Existing Interview-Prep Quota Functionality Remains Fully Operational', () => {
    it('should perform slot reservation, quota decrement, and refund without errors', async () => {
      const company = await createTestCompany();
      const recruiter = await createTestRecruiter(company.id);
      const student = await createTestStudent();
      const job = await createTestJob(recruiter.recruiter.id, company.id);

      const reservation = await quotaStore.reserveSlot(
        student.student.id,
        job.id
      );
      assert.ok(reservation);
      assert.ok(reservation.reservationId);

      const usage = await quotaStore.getUsageToday(student.student.id);
      assert.equal(usage, 1);

      await quotaStore.refundSlot(reservation.reservationId);

      const usageAfterRefund = await quotaStore.getUsageToday(
        student.student.id
      );
      assert.equal(usageAfterRefund, 0);
    });
  });
});
