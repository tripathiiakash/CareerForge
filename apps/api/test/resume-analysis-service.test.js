const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  ResumeAnalysisService,
} = require('../dist/modules/resume/services/resume-analysis.service');

describe('ResumeAnalysisService Test Suite', () => {
  let service;
  let mockPrisma;
  let mockStudentService;
  let mockQueueService;

  const validStudentUserId = '11111111-1111-4111-8111-111111111111';
  const otherStudentUserId = '22222222-2222-4222-8222-222222222222';
  const studentProfileId = '33333333-3333-4333-8333-333333333333';
  const resumeId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    mockStudentService = {
      getProfileByUserId: async (userId) => {
        if (userId === validStudentUserId) {
          return { id: studentProfileId, user_id: validStudentUserId };
        }
        return {
          id: 'other-student-id-9999-9999-9999-999999999999',
          user_id: otherStudentUserId,
        };
      },
    };

    mockPrisma = {
      resume: {
        findUnique: async () => null,
      },
      aiAnalysis: {
        upsert: async () => ({ id: 'analysis-123' }),
      },
    };

    mockQueueService = {
      send: async () => 'job-123',
    };

    service = new ResumeAnalysisService(
      mockPrisma,
      mockStudentService,
      mockQueueService
    );
  });

  describe('triggerAnalysis', () => {
    it('should reject invalid UUID format with 400 BadRequestException', async () => {
      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, 'not-a-valid-uuid'),
        (err) => err.status === 400 && err.response.code === 'VALIDATION_ERROR'
      );
    });

    it('should reject nonexistent resume with 404 NotFoundException', async () => {
      mockPrisma.resume.findUnique = async () => null;

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('should reject when resume belongs to a different student with 403 ForbiddenException', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: 'different-student-uuid',
        parsed_text: 'Valid resume text',
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 403 && err.response.code === 'FORBIDDEN'
      );
    });

    it('should reject with 409 CONFLICT if resume has no parsed_text yet', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: null,
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 409 && err.response.code === 'CONFLICT'
      );

      // Also verify empty whitespace parsed_text is rejected
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: '   \n  ',
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 409 && err.response.code === 'CONFLICT'
      );
    });

    it('should reject with 422 UNPROCESSABLE_ENTITY if text extraction failed with FAILED status', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: null,
        ai_analysis: {
          status: 'FAILED',
          error_message:
            'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.',
        },
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => {
          assert.equal(err.status, 422);
          assert.equal(err.response.code, 'UNPROCESSABLE_ENTITY');
          assert.match(err.response.message, /image scan/);
          return true;
        }
      );
    });

    it('should reject with 429 TOO_MANY_REQUESTS if analysis is currently PROCESSING and fresh (concurrency lock)', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'PROCESSING',
          created_at: new Date(),
        },
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 429 && err.response.code === 'RATE_LIMITED'
      );
    });

    it('should reject with 429 TOO_MANY_REQUESTS if PROCESSING within the legitimate retry window (2 minutes ago)', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'PROCESSING',
          created_at: twoMinutesAgo,
        },
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 429 && err.response.code === 'RATE_LIMITED'
      );
    });

    it('should reject with 429 TOO_MANY_REQUESTS if PROCESSING at 5 minutes ago (within the 6-minute worst-case retry window)', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'PROCESSING',
          created_at: fiveMinutesAgo,
        },
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 429 && err.response.code === 'RATE_LIMITED'
      );
    });

    it('should recover from abandoned/stale PROCESSING state older than 6 minutes and allow new analysis', async () => {
      const sevenMinutesAgo = new Date(Date.now() - 7 * 60 * 1000);
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'PROCESSING',
          created_at: sevenMinutesAgo,
        },
      });

      let upsertArgs = null;
      mockPrisma.aiAnalysis.upsert = async (args) => {
        upsertArgs = args;
        return {};
      };

      let queuedJob = null;
      mockQueueService.send = async (queueName, data, options) => {
        queuedJob = { queueName, data, options };
        return 'job-recovery-1';
      };

      const result = await service.triggerAnalysis(
        validStudentUserId,
        resumeId
      );

      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.resume_id, resumeId);
      assert.ok(upsertArgs);
      assert.equal(upsertArgs.where.resume_id, resumeId);
      assert.equal(upsertArgs.update.status, 'PROCESSING');
      assert.ok(upsertArgs.update.created_at instanceof Date);
      assert.ok(queuedJob);
      assert.equal(queuedJob.queueName, 'resume-ai-analysis');
      assert.equal(queuedJob.options.singletonKey, resumeId);
      assert.equal(queuedJob.options.retryLimit, 2);
      assert.equal(queuedJob.options.expireInSeconds, 120);
    });

    it('should reject with 429 TOO_MANY_REQUESTS if COMPLETED within the 5-minute cooldown period', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'COMPLETED',
          created_at: twoMinutesAgo,
        },
      });

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 429 && err.response.code === 'RATE_LIMITED'
      );
    });

    it('should allow trigger if COMPLETED older than 5 minutes', async () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'COMPLETED',
          created_at: sixMinutesAgo,
        },
      });

      let upsertCalled = false;
      mockPrisma.aiAnalysis.upsert = async () => {
        upsertCalled = true;
        return {};
      };

      let queuedJob = null;
      mockQueueService.send = async (queueName, data, options) => {
        queuedJob = { queueName, data, options };
        return 'job-1';
      };

      const result = await service.triggerAnalysis(
        validStudentUserId,
        resumeId
      );

      assert.equal(upsertCalled, true);
      assert.equal(queuedJob.queueName, 'resume-ai-analysis');
      assert.equal(queuedJob.data.resumeId, resumeId);
      assert.equal(queuedJob.data.studentId, studentProfileId);
      assert.equal(queuedJob.options.singletonKey, resumeId);
      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.resume_id, resumeId);
    });

    it('should allow trigger immediately if previous analysis status was FAILED', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'FAILED',
          created_at: new Date(),
        },
      });

      const result = await service.triggerAnalysis(
        validStudentUserId,
        resumeId
      );
      assert.equal(result.status, 'PROCESSING');
    });

    it('should reject retrigger while retryable failure is in backoff, then allow recovery once stale', async () => {
      // Step 1: Initial analysis enqueued at T0
      const t0 = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      let analysisRecord = {
        status: 'PROCESSING',
        created_at: t0,
      };

      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: analysisRecord,
      });

      // Step 2: Retryable failure occurred in worker, leaving DB in PROCESSING.
      // At T0 + 2m, user attempts to trigger analysis again while retries are still pending.
      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => {
          assert.equal(err.status, 429);
          assert.equal(err.response.code, 'RATE_LIMITED');
          assert.match(err.response.message, /Please wait before re-analyzing this resume/);
          return true;
        }
      );

      // Step 3: Now simulate worker/server crash or pg-boss job expiration:
      // Time advances past the 6-minute stale threshold (T0 + 7m)
      const t7 = new Date(Date.now() - 7 * 60 * 1000);
      analysisRecord.created_at = t7;

      let reEnqueued = false;
      mockQueueService.send = async (queue, data, opts) => {
        reEnqueued = true;
        assert.equal(opts.singletonKey, resumeId);
        assert.equal(opts.expireInSeconds, 120);
        return 'new-recovery-job';
      };

      const recoveryResult = await service.triggerAnalysis(validStudentUserId, resumeId);
      assert.equal(recoveryResult.status, 'PROCESSING');
      assert.equal(reEnqueued, true);
    });

    it('Scenario 3: when DB timestamp is older than stale threshold but pg-boss job is still retrying/active, exclusive policy deduplicates and prevents second job', async () => {
      // A. Resume analysis is PROCESSING in the database.
      // C. The DB timestamp becomes older than the stale threshold (7 minutes ago).
      const sevenMinutesAgo = new Date(Date.now() - 7 * 60 * 1000);
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: {
          status: 'PROCESSING',
          created_at: sevenMinutesAgo,
        },
      });

      // B & D. A corresponding pg-boss job exists in retry or active state in the queue.
      // In PostgreSQL, pg-boss index job_i6 enforces UNIQUE(name, COALESCE(singleton_key, '')) WHERE state <= 'active' AND policy = 'exclusive'.
      // Therefore, pg-boss insertJobs encounters conflict, performs ON CONFLICT DO NOTHING, and returns null.
      let sendCalled = false;
      mockQueueService.send = async (queueName, data, options) => {
        sendCalled = true;
        assert.equal(queueName, 'resume-ai-analysis');
        assert.equal(options.singletonKey, resumeId);
        // Simulate pg-boss returning null due to exclusive policy deduplication
        return null;
      };

      const result = await service.triggerAnalysis(validStudentUserId, resumeId);

      // Verify that the system handled deduplication gracefully without error or creating a duplicate job
      assert.equal(sendCalled, true);
      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.resume_id, resumeId);
    });

    it('should catch queue enqueue error, rollback DB to FAILED, and not lock user out for 6 minutes', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        parsed_text: 'Valid resume text',
        ai_analysis: null,
      });

      let updatedState = null;
      mockPrisma.aiAnalysis.update = async (params) => {
        updatedState = params.data;
        return {};
      };

      mockQueueService.send = async () => {
        throw new Error('pg-boss connection refused');
      };

      await assert.rejects(
        () => service.triggerAnalysis(validStudentUserId, resumeId),
        (err) => {
          assert.equal(err.status, 500);
          assert.equal(err.response.code, 'QUEUE_ERROR');
          return true;
        }
      );

      // Verify DB was marked FAILED so student is not locked out
      assert.ok(updatedState);
      assert.equal(updatedState.status, 'FAILED');
      assert.match(updatedState.error_message, /Failed to schedule analysis job/);
    });
  });

  describe('getAnalysis', () => {
    it('should throw 404 NotFoundException if analysis was never triggered', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        ai_analysis: null,
      });

      await assert.rejects(
        () => service.getAnalysis(validStudentUserId, resumeId),
        (err) => err.status === 404 && err.response.code === 'NOT_FOUND'
      );
    });

    it('should return PROCESSING status with null analysis payload when in progress', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        ai_analysis: {
          status: 'PROCESSING',
          created_at: new Date(),
        },
      });

      const result = await service.getAnalysis(validStudentUserId, resumeId);
      assert.equal(result.status, 'PROCESSING');
      assert.equal(result.analysis, null);
    });

    it('should return COMPLETED status with structured analysis details when finished', async () => {
      const timestamp = new Date();
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        ai_analysis: {
          status: 'COMPLETED',
          score: 85,
          missing_skills: ['Docker'],
          formatting_tips: ['Use action verbs'],
          created_at: timestamp,
        },
      });

      const result = await service.getAnalysis(validStudentUserId, resumeId);
      assert.equal(result.status, 'COMPLETED');
      assert.equal(result.analysis.score, 85);
      assert.deepEqual(result.analysis.missing_skills, ['Docker']);
      assert.deepEqual(result.analysis.formatting_tips, ['Use action verbs']);
      assert.equal(result.analysis.created_at, timestamp.toISOString());
    });

    it('should return FAILED status with error_message when analysis failed', async () => {
      mockPrisma.resume.findUnique = async () => ({
        id: resumeId,
        student_id: studentProfileId,
        ai_analysis: {
          status: 'FAILED',
          error_message: 'Failed to analyze resume.',
          created_at: new Date(),
        },
      });

      const result = await service.getAnalysis(validStudentUserId, resumeId);
      assert.equal(result.status, 'FAILED');
      assert.equal(result.error_message, 'Failed to analyze resume.');
      assert.equal(result.analysis, null);
    });
  });
});
