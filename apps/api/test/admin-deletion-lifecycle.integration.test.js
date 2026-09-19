const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  UserRole,
  EmploymentType,
  JobStatus,
  AnalysisStatus,
  ApplicationStatus,
} = require('@prisma/client');
const {
  createTestPrisma,
  assertDatabaseReachable,
  assertMigrationsApplied,
} = require('./setup/db-test-harness');
const { AdminUserService } = require('../dist/modules/admin/admin-user.service');
const { AdminUserController } = require('../dist/modules/admin/admin-user.controller');

describe('Phase 6.6-E3: Admin Relational Deletion Lifecycle Integration Suite', () => {
  const suiteRunId = crypto.randomBytes(4).toString('hex');

  let prisma;
  let adminUserService;
  let adminUserController;

  // Track all created entity IDs for clean, FK-safe teardown
  const createdUserIds = [];
  const createdCompanyIds = [];
  const createdJobIds = [];
  const createdStudentIds = [];
  const createdRecruiterIds = [];
  const createdResumeIds = [];
  const createdAppIds = [];
  const createdAiAnalysisIds = [];
  const createdLogIds = [];
  const createdEmailKeys = [];

  before(async () => {
    // Safety check: creates client strictly against TEST_DATABASE_URL
    prisma = createTestPrisma();
    await assertDatabaseReachable(prisma);
    await assertMigrationsApplied(prisma);

    adminUserService = new AdminUserService(prisma);
    adminUserController = new AdminUserController(adminUserService);
  });

  after(async () => {
    // Teardown created test entities in strict FK-safe order
    if (prisma) {
      try {
        if (createdAppIds.length > 0) {
          await prisma.application.deleteMany({
            where: { id: { in: createdAppIds } },
          });
        }
        if (createdAiAnalysisIds.length > 0) {
          await prisma.aiAnalysis.deleteMany({
            where: { id: { in: createdAiAnalysisIds } },
          });
        }
        if (createdResumeIds.length > 0) {
          await prisma.resume.deleteMany({
            where: { id: { in: createdResumeIds } },
          });
        }
        if (createdLogIds.length > 0) {
          await prisma.interviewPrepLog.deleteMany({
            where: { id: { in: createdLogIds } },
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
      } catch (err) {
        console.error('Error in after() cleanup:', err.message);
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  // Helper to create an admin user
  async function createAdminFixture(prefix = 'admin') {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suiteRunId}-${crypto.randomUUID()}@example.com`,
        password_hash: 'hashed_admin_password',
        role: UserRole.ADMIN,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  // Helper to create a company, recruiter, and jobs
  async function createCompanyAndRecruiterFixture(jobCount = 2, prefix = 'rec') {
    const company = await prisma.company.create({
      data: {
        name: `Co-${prefix}-${suiteRunId}-${crypto.randomUUID().slice(0, 8)}`,
        website: 'https://example.com',
      },
    });
    createdCompanyIds.push(company.id);

    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suiteRunId}-${crypto.randomUUID()}@example.com`,
        password_hash: 'hashed_recruiter_password',
        role: UserRole.RECRUITER,
      },
    });
    createdUserIds.push(user.id);

    const recruiter = await prisma.recruiter.create({
      data: {
        user_id: user.id,
        company_id: company.id,
        first_name: 'RecruiterFirst',
        last_name: 'RecruiterLast',
        is_approved: true,
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
          description: 'Job description for deletion lifecycle testing',
          required_skills: ['TypeScript', 'Node.js'],
          employment_type: EmploymentType.FULL_TIME,
          status: JobStatus.ACTIVE,
        },
      });
      createdJobIds.push(job.id);
      jobs.push(job);
    }

    return { company, user, recruiter, jobs };
  }

  // Helper to create a student with full relational graph
  async function createStudentWithFullGraph(targetJobs = [], prefix = 'stud') {
    const user = await prisma.user.create({
      data: {
        email: `${prefix}-${suiteRunId}-${crypto.randomUUID()}@example.com`,
        password_hash: 'hashed_student_password',
        role: UserRole.STUDENT,
      },
    });
    createdUserIds.push(user.id);

    const student = await prisma.student.create({
      data: {
        user_id: user.id,
        first_name: 'StudentFirst',
        last_name: 'StudentLast',
        university: 'University of Engineering',
        graduation_year: 2026,
        degree: 'B.S. Computer Science',
        skills: ['TypeScript', 'PostgreSQL', 'NestJS'],
      },
    });
    createdStudentIds.push(student.id);

    // Create 2 resumes (primary and secondary)
    const resume1 = await prisma.resume.create({
      data: {
        student_id: student.id,
        file_key: `resumes/${student.id}/primary-${crypto.randomUUID()}.pdf`,
        file_url: 'https://storage.example.com/primary.pdf',
        parsed_text: 'Experienced software engineer skilled in TypeScript and PostgreSQL.',
        is_primary: true,
      },
    });
    createdResumeIds.push(resume1.id);

    const resume2 = await prisma.resume.create({
      data: {
        student_id: student.id,
        file_key: `resumes/${student.id}/secondary-${crypto.randomUUID()}.pdf`,
        file_url: 'https://storage.example.com/secondary.pdf',
        parsed_text: 'Frontend specialist experienced with React and modern CSS.',
        is_primary: false,
      },
    });
    createdResumeIds.push(resume2.id);

    // Create AI Analyses for both resumes
    const aiAnalysis1 = await prisma.aiAnalysis.create({
      data: {
        resume_id: resume1.id,
        status: AnalysisStatus.COMPLETED,
        score: 88,
        missing_skills: ['GraphQL', 'Docker'],
        formatting_tips: ['Use consistent bullet points'],
      },
    });
    createdAiAnalysisIds.push(aiAnalysis1.id);

    const aiAnalysis2 = await prisma.aiAnalysis.create({
      data: {
        resume_id: resume2.id,
        status: AnalysisStatus.PROCESSING,
      },
    });
    createdAiAnalysisIds.push(aiAnalysis2.id);

    // Create applications for targetJobs
    const applications = [];
    const logs = [];

    for (let i = 0; i < targetJobs.length; i++) {
      const targetJob = targetJobs[i];
      const resumeUsed = i % 2 === 0 ? resume1 : resume2;

      const app = await prisma.application.create({
        data: {
          job_id: targetJob.id,
          student_id: student.id,
          resume_id: resumeUsed.id,
          status: ApplicationStatus.APPLIED,
        },
      });
      createdAppIds.push(app.id);
      applications.push(app);

      // Create InterviewPrepLog for each application
      const log = await prisma.interviewPrepLog.create({
        data: {
          student_id: student.id,
          job_id: targetJob.id,
        },
      });
      createdLogIds.push(log.id);
      logs.push(log);
    }

    // Create an EmailDelivery record referencing student email
    const emailKey = `email-deliv-${suiteRunId}-${crypto.randomUUID()}`;
    const emailDelivery = await prisma.emailDelivery.create({
      data: {
        idempotency_key: emailKey,
        event_type: 'APPLICATION_SUBMITTED_STUDENT',
        recipient_email: user.email,
        subject: 'Application confirmation',
        body_text: 'Your application has been received.',
        status: 'SENT',
      },
    });
    createdEmailKeys.push(emailKey);

    return {
      user,
      student,
      resumes: [resume1, resume2],
      resumeIds: [resume1.id, resume2.id],
      aiAnalyses: [aiAnalysis1, aiAnalysis2],
      applications,
      logs,
      emailDelivery,
    };
  }

  // =========================================================================
  // 1. ADMIN GUARDS & VALIDATION BOUNDARIES
  // =========================================================================
  describe('1. Admin Guards & Self-Deletion Protection', () => {
    it('should reject admin self-deletion with 400 VALIDATION_ERROR', async () => {
      const admin = await createAdminFixture('self-del');

      await assert.rejects(
        () => adminUserService.deleteUser(admin.id, admin.id),
        (err) => {
          assert.equal(err.getStatus?.() ?? err.status, 400);
          const resp = err.getResponse?.() ?? err;
          assert.equal(resp.code, 'VALIDATION_ERROR');
          assert.match(resp.message, /Admins cannot delete their own account/);
          return true;
        }
      );

      // Verify admin account remains intact in database
      const adminInDb = await prisma.user.findUnique({
        where: { id: admin.id },
      });
      assert.ok(adminInDb, 'Admin user must still exist in DB after rejected self-deletion');
    });

    it('should reject deletion of non-existent user with 404 NOT_FOUND', async () => {
      const admin = await createAdminFixture('notfound-adm');
      const nonExistentId = crypto.randomUUID();

      await assert.rejects(
        () => adminUserService.deleteUser(nonExistentId, admin.id),
        (err) => {
          assert.equal(err.getStatus?.() ?? err.status, 404);
          const resp = err.getResponse?.() ?? err;
          assert.equal(resp.code, 'NOT_FOUND');
          assert.match(resp.message, /User does not exist/);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 2. STUDENT DELETION INTEGRATION TEST (Complete Relational Graph)
  // =========================================================================
  describe('2. Student Deletion Lifecycle (Complete Relational Graph)', () => {
    it('should delete User, Student, Resumes, AiAnalyses, Applications, and Logs while preserving unrelated entities', async () => {
      const admin = await createAdminFixture('stud-del-adm');
      const { jobs } = await createCompanyAndRecruiterFixture(2, 'stud-target-rec');

      // Create target student with full relational graph across 2 jobs
      const targetStudent = await createStudentWithFullGraph(jobs, 'target-stud');

      // Create unrelated student with full relational graph across the same jobs
      const otherStudent = await createStudentWithFullGraph(jobs, 'other-stud');

      // Precondition: Verify all target student records exist in PostgreSQL
      const userPre = await prisma.user.findUnique({ where: { id: targetStudent.user.id } });
      const studentPre = await prisma.student.findUnique({ where: { id: targetStudent.student.id } });
      const resumesPre = await prisma.resume.count({ where: { student_id: targetStudent.student.id } });
      const aiPre = await prisma.aiAnalysis.count({ where: { resume_id: { in: targetStudent.resumeIds } } });
      const appsPre = await prisma.application.count({ where: { student_id: targetStudent.student.id } });
      const logsPre = await prisma.interviewPrepLog.count({ where: { student_id: targetStudent.student.id } });

      assert.ok(userPre, 'Target user must exist before delete');
      assert.ok(studentPre, 'Target student must exist before delete');
      assert.equal(resumesPre, 2, 'Target student must have 2 resumes before delete');
      assert.equal(aiPre, 2, 'Target student must have 2 AI analyses before delete');
      assert.equal(appsPre, 2, 'Target student must have 2 applications before delete');
      assert.equal(logsPre, 2, 'Target student must have 2 interview prep logs before delete');

      // EXECUTE REAL ADMIN DELETION
      const result = await adminUserService.deleteUser(
        targetStudent.user.id,
        admin.id
      );
      assert.deepEqual(result, {
        message: 'User and associated data deleted.',
      });

      // 1. Verify target User and Student are deleted
      const userPost = await prisma.user.findUnique({ where: { id: targetStudent.user.id } });
      const studentPost = await prisma.student.findUnique({ where: { id: targetStudent.student.id } });
      assert.equal(userPost, null, 'User record must be deleted');
      assert.equal(studentPost, null, 'Student profile record must be deleted');

      // 2. Verify all Resumes and linked AiAnalyses are deleted
      const resumesPost = await prisma.resume.count({
        where: { student_id: targetStudent.student.id },
      });
      assert.equal(resumesPost, 0, 'All student resumes must be deleted');

      const aiPost = await prisma.aiAnalysis.count({
        where: { resume_id: { in: targetStudent.resumeIds } },
      });
      assert.equal(aiPost, 0, 'All linked AI analyses must be deleted');

      // 3. Verify all Applications submitted by student are deleted
      const appsPost = await prisma.application.count({
        where: { student_id: targetStudent.student.id },
      });
      assert.equal(appsPost, 0, 'All applications by the student must be deleted');

      // 4. Verify all InterviewPrepLogs for student are deleted
      const logsPost = await prisma.interviewPrepLog.count({
        where: { student_id: targetStudent.student.id },
      });
      assert.equal(logsPost, 0, 'All interview prep logs for the student must be deleted');

      // 5. Verify detached EmailDelivery records remain intact as immutable audit logs
      const emailPost = await prisma.emailDelivery.findUnique({
        where: { idempotency_key: targetStudent.emailDelivery.idempotency_key },
      });
      assert.ok(emailPost, 'Decoupled EmailDelivery record must be preserved for audit');

      // 6. Verify target jobs remain intact in PostgreSQL
      for (const job of jobs) {
        const jobInDb = await prisma.job.findUnique({ where: { id: job.id } });
        assert.ok(jobInDb, 'Target jobs must survive student deletion');
      }

      // 7. Verify UNRELATED student's entire graph is 100% preserved
      const otherUserPost = await prisma.user.findUnique({ where: { id: otherStudent.user.id } });
      const otherStudentPost = await prisma.student.findUnique({ where: { id: otherStudent.student.id } });
      const otherResumesPost = await prisma.resume.count({ where: { student_id: otherStudent.student.id } });
      const otherAiPost = await prisma.aiAnalysis.count({ where: { resume_id: { in: otherStudent.resumeIds } } });
      const otherAppsPost = await prisma.application.count({ where: { student_id: otherStudent.student.id } });
      const otherLogsPost = await prisma.interviewPrepLog.count({ where: { student_id: otherStudent.student.id } });

      assert.ok(otherUserPost, 'Unrelated user must remain intact');
      assert.ok(otherStudentPost, 'Unrelated student must remain intact');
      assert.equal(otherResumesPost, 2, 'Unrelated student resumes must remain intact');
      assert.equal(otherAiPost, 2, 'Unrelated AI analyses must remain intact');
      assert.equal(otherAppsPost, 2, 'Unrelated applications must remain intact');
      assert.equal(otherLogsPost, 2, 'Unrelated interview prep logs must remain intact');
    });
  });

  // =========================================================================
  // 3. RECRUITER DELETION INTEGRATION TEST (Complete Relational Graph)
  // =========================================================================
  describe('3. Recruiter Deletion Lifecycle (Complete Relational Graph)', () => {
    it('should delete Recruiter, User, Jobs, linked Applications and Logs, while preserving Company and Student accounts', async () => {
      const admin = await createAdminFixture('rec-del-adm');

      // Recruiter A (Target) with 2 jobs
      const targetRecruiter = await createCompanyAndRecruiterFixture(2, 'target-rec');
      // Recruiter B (Unrelated) with 1 job in a different company
      const otherRecruiter = await createCompanyAndRecruiterFixture(1, 'other-rec');

      // Create students who applied to target recruiter's jobs
      const applicantStudent1 = await createStudentWithFullGraph([targetRecruiter.jobs[0]], 'app-stud1');
      const applicantStudent2 = await createStudentWithFullGraph([targetRecruiter.jobs[1]], 'app-stud2');

      // Also create an application for the unrelated recruiter's job
      const otherApplicant = await createStudentWithFullGraph([otherRecruiter.jobs[0]], 'other-app-stud');

      // Verify pre-conditions
      const targetJobIds = targetRecruiter.jobs.map((j) => j.id);
      const appsOnTargetJobsPre = await prisma.application.count({
        where: { job_id: { in: targetJobIds } },
      });
      const logsOnTargetJobsPre = await prisma.interviewPrepLog.count({
        where: { job_id: { in: targetJobIds } },
      });
      assert.equal(appsOnTargetJobsPre, 2, 'Target recruiter jobs must have 2 applications before delete');
      assert.equal(logsOnTargetJobsPre, 2, 'Target recruiter jobs must have 2 interview logs before delete');

      // EXECUTE REAL ADMIN DELETION OF RECRUITER
      const result = await adminUserService.deleteUser(
        targetRecruiter.user.id,
        admin.id
      );
      assert.deepEqual(result, {
        message: 'User and associated data deleted.',
      });

      // 1. Verify target Recruiter User and Recruiter profile are deleted
      const userPost = await prisma.user.findUnique({ where: { id: targetRecruiter.user.id } });
      const recruiterPost = await prisma.recruiter.findUnique({ where: { id: targetRecruiter.recruiter.id } });
      assert.equal(userPost, null, 'Recruiter User must be deleted');
      assert.equal(recruiterPost, null, 'Recruiter profile must be deleted');

      // 2. Verify all Jobs owned by recruiter are deleted
      const jobsPost = await prisma.job.count({
        where: { recruiter_id: targetRecruiter.recruiter.id },
      });
      assert.equal(jobsPost, 0, 'All jobs owned by deleted recruiter must be deleted');

      // 3. Verify all Applications referencing target recruiter's jobs are deleted
      const appsPost = await prisma.application.count({
        where: { job_id: { in: targetJobIds } },
      });
      assert.equal(appsPost, 0, 'All applications submitted to deleted jobs must be removed');

      // 4. Verify all InterviewPrepLogs referencing target recruiter's jobs are deleted
      const logsPost = await prisma.interviewPrepLog.count({
        where: { job_id: { in: targetJobIds } },
      });
      assert.equal(logsPost, 0, 'All interview prep logs referencing deleted jobs must be removed');

      // 5. Verify Company is PRESERVED (companies are platform entities, not owned exclusively)
      const companyPost = await prisma.company.findUnique({
        where: { id: targetRecruiter.company.id },
      });
      assert.ok(companyPost, 'Company must be preserved when recruiter is deleted');

      // 6. Verify Applicant Students who applied to deleted jobs are NOT deleted
      const student1UserPost = await prisma.user.findUnique({ where: { id: applicantStudent1.user.id } });
      const student1Post = await prisma.student.findUnique({ where: { id: applicantStudent1.student.id } });
      const student1ResumesPost = await prisma.resume.count({ where: { student_id: applicantStudent1.student.id } });
      assert.ok(student1UserPost, 'Applicant student user must remain intact');
      assert.ok(student1Post, 'Applicant student profile must remain intact');
      assert.equal(student1ResumesPost, 2, 'Applicant student resumes must remain intact');

      const student2UserPost = await prisma.user.findUnique({ where: { id: applicantStudent2.user.id } });
      const student2Post = await prisma.student.findUnique({ where: { id: applicantStudent2.student.id } });
      assert.ok(student2UserPost, 'Applicant student 2 user must remain intact');
      assert.ok(student2Post, 'Applicant student 2 profile must remain intact');

      // 7. Verify UNRELATED Recruiter, Company, Job, and Applications remain intact
      const otherUserPost = await prisma.user.findUnique({ where: { id: otherRecruiter.user.id } });
      const otherRecruiterPost = await prisma.recruiter.findUnique({ where: { id: otherRecruiter.recruiter.id } });
      const otherJobsPost = await prisma.job.count({ where: { recruiter_id: otherRecruiter.recruiter.id } });
      const otherAppsPost = await prisma.application.count({ where: { job_id: otherRecruiter.jobs[0].id } });

      assert.ok(otherUserPost, 'Unrelated recruiter user must remain intact');
      assert.ok(otherRecruiterPost, 'Unrelated recruiter profile must remain intact');
      assert.equal(otherJobsPost, 1, 'Unrelated recruiter jobs must remain intact');
      assert.equal(otherAppsPost, 1, 'Unrelated application must remain intact');
    });
  });

  // =========================================================================
  // 4. CONTROLLER-LEVEL DELETION FLOW
  // =========================================================================
  describe('4. Controller-Level Admin Deletion Flow', () => {
    it('should successfully delete student via AdminUserController with valid envelope response', async () => {
      const admin = await createAdminFixture('ctrl-adm');
      const { jobs } = await createCompanyAndRecruiterFixture(1, 'ctrl-rec');
      const student = await createStudentWithFullGraph(jobs, 'ctrl-stud');

      const adminUserContext = {
        userId: admin.id,
        email: admin.email,
        role: UserRole.ADMIN,
      };

      const response = await adminUserController.deleteUser(
        student.user.id,
        adminUserContext
      );

      assert.deepEqual(response, {
        success: true,
        message: 'User and associated data deleted.',
      });

      // Verify deletion in database
      const userInDb = await prisma.user.findUnique({ where: { id: student.user.id } });
      assert.equal(userInDb, null, 'User must be deleted via controller call');
    });
  });

  // =========================================================================
  // 5. TRANSACTION ATOMICITY & FAILURE ROLLBACK
  // =========================================================================
  describe('5. Transaction Atomicity & Failure Rollback', () => {
    it('should roll back completely and preserve all records if a failure occurs midway in transaction', async () => {
      const admin = await createAdminFixture('rollback-adm');
      const { jobs } = await createCompanyAndRecruiterFixture(2, 'rollback-rec');
      const student = await createStudentWithFullGraph(jobs, 'rollback-stud');

      // Precondition: verify all entities exist
      const userPre = await prisma.user.findUnique({ where: { id: student.user.id } });
      const studentPre = await prisma.student.findUnique({ where: { id: student.student.id } });
      const resumesPre = await prisma.resume.count({ where: { student_id: student.student.id } });
      const aiPre = await prisma.aiAnalysis.count({ where: { resume_id: { in: student.resumeIds } } });
      const appsPre = await prisma.application.count({ where: { student_id: student.student.id } });
      const logsPre = await prisma.interviewPrepLog.count({ where: { student_id: student.student.id } });

      assert.ok(userPre);
      assert.ok(studentPre);
      assert.equal(resumesPre, 2);
      assert.equal(aiPre, 2);
      assert.equal(appsPre, 2);
      assert.equal(logsPre, 2);

      // Wrap Prisma in a proxy to inject a failure at the final step (tx.user.delete)
      // while executing inside the real PostgreSQL $transaction.
      // In topological order: applications, logs, ai_analyses, resumes, student have already been deleted
      // when tx.user.delete is called!
      const interceptedPrisma = {
        user: {
          findUnique: (args) => prisma.user.findUnique(args),
        },
        $transaction: async (fn) => {
          return prisma.$transaction(async (tx) => {
            // Intercept user.delete inside the real active PostgreSQL transaction
            tx.user.delete = async () => {
              throw new Error('SIMULATED_DATABASE_ABORT_AT_FINAL_STEP');
            };
            return fn(tx);
          });
        },
      };

      const failingService = new AdminUserService(interceptedPrisma);

      await assert.rejects(
        () => failingService.deleteUser(student.user.id, admin.id),
        (err) => err.message === 'SIMULATED_DATABASE_ABORT_AT_FINAL_STEP'
      );

      // CRITICAL ATOMICITY CHECK:
      // The real PostgreSQL transaction must have rolled back completely!
      // All rows that were deleted earlier in the transaction must be restored by PostgreSQL!

      const userPost = await prisma.user.findUnique({ where: { id: student.user.id } });
      assert.ok(userPost, 'User must still exist in DB after transaction rollback');

      const studentPost = await prisma.student.findUnique({ where: { id: student.student.id } });
      assert.ok(studentPost, 'Student profile must still exist in DB after transaction rollback');

      const resumesPost = await prisma.resume.count({
        where: { student_id: student.student.id },
      });
      assert.equal(
        resumesPost,
        resumesPre,
        'All student resumes must still exist in DB after rollback'
      );

      const aiPost = await prisma.aiAnalysis.count({
        where: { resume_id: { in: student.resumeIds } },
      });
      assert.equal(
        aiPost,
        aiPre,
        'All AI analyses must still exist in DB after rollback'
      );

      const appsPost = await prisma.application.count({
        where: { student_id: student.student.id },
      });
      assert.equal(
        appsPost,
        appsPre,
        'All applications must still exist in DB after rollback'
      );

      const logsPost = await prisma.interviewPrepLog.count({
        where: { student_id: student.student.id },
      });
      assert.equal(
        logsPost,
        logsPre,
        'All interview prep logs must still exist in DB after rollback'
      );
    });
  });

  // =========================================================================
  // 6. GLOBAL FOREIGN-KEY & ORPHAN INTEGRITY ASSERTIONS
  // =========================================================================
  describe('6. Global Foreign-Key & Orphan Prevention Assertions', () => {
    it('verifies that no orphaned dependent records exist across all child tables in the database', async () => {
      // 1. Applications referencing non-existent students
      const orphanAppsByStudent = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM applications
        WHERE student_id NOT IN (SELECT id FROM students)
      `;
      assert.equal(orphanAppsByStudent[0].count, 0, 'No applications with orphaned student_id');

      // 2. Applications referencing non-existent jobs
      const orphanAppsByJob = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM applications
        WHERE job_id NOT IN (SELECT id FROM jobs)
      `;
      assert.equal(orphanAppsByJob[0].count, 0, 'No applications with orphaned job_id');

      // 3. Applications referencing non-existent resumes
      const orphanAppsByResume = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM applications
        WHERE resume_id NOT IN (SELECT id FROM resumes)
      `;
      assert.equal(orphanAppsByResume[0].count, 0, 'No applications with orphaned resume_id');

      // 4. Resumes referencing non-existent students
      const orphanResumes = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM resumes
        WHERE student_id NOT IN (SELECT id FROM students)
      `;
      assert.equal(orphanResumes[0].count, 0, 'No resumes with orphaned student_id');

      // 5. AI Analyses referencing non-existent resumes
      const orphanAiAnalyses = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM ai_analyses
        WHERE resume_id NOT IN (SELECT id FROM resumes)
      `;
      assert.equal(orphanAiAnalyses[0].count, 0, 'No AI analyses with orphaned resume_id');

      // 6. InterviewPrepLogs referencing non-existent students
      const orphanLogsByStudent = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM interview_prep_logs
        WHERE student_id NOT IN (SELECT id FROM students)
      `;
      assert.equal(orphanLogsByStudent[0].count, 0, 'No interview logs with orphaned student_id');

      // 7. InterviewPrepLogs referencing non-existent jobs
      const orphanLogsByJob = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM interview_prep_logs
        WHERE job_id NOT IN (SELECT id FROM jobs)
      `;
      assert.equal(orphanLogsByJob[0].count, 0, 'No interview logs with orphaned job_id');

      // 8. Students referencing non-existent users
      const orphanStudents = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM students
        WHERE user_id NOT IN (SELECT id FROM users)
      `;
      assert.equal(orphanStudents[0].count, 0, 'No students with orphaned user_id');

      // 9. Recruiters referencing non-existent users
      const orphanRecruiters = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM recruiters
        WHERE user_id NOT IN (SELECT id FROM users)
      `;
      assert.equal(orphanRecruiters[0].count, 0, 'No recruiters with orphaned user_id');

      // 10. Jobs referencing non-existent recruiters
      const orphanJobs = await prisma.$queryRaw`
        SELECT count(*)::int as count
        FROM jobs
        WHERE recruiter_id NOT IN (SELECT id FROM recruiters)
      `;
      assert.equal(orphanJobs[0].count, 0, 'No jobs with orphaned recruiter_id');
    });
  });

  // =========================================================================
  // 7. FIXTURE ISOLATION & TRACKING INTEGRITY
  // =========================================================================
  describe('7. Fixture Tracking & Isolation Verification', () => {
    it('verifies that all test lifecycle fixtures were properly populated and tracked', () => {
      assert.ok(createdUserIds.length > 0, 'Users were tracked');
      assert.ok(createdCompanyIds.length > 0, 'Companies were tracked');
      assert.ok(createdJobIds.length > 0, 'Jobs were tracked');
      assert.ok(createdStudentIds.length > 0, 'Students were tracked');
      assert.ok(createdRecruiterIds.length > 0, 'Recruiters were tracked');
      assert.ok(createdResumeIds.length > 0, 'Resumes were tracked');
      assert.ok(createdAiAnalysisIds.length > 0, 'AI analyses were tracked');
      assert.ok(createdAppIds.length > 0, 'Applications were tracked');
      assert.ok(createdLogIds.length > 0, 'Interview prep logs were tracked');
      assert.ok(createdEmailKeys.length > 0, 'Email keys were tracked');
    });
  });
});
