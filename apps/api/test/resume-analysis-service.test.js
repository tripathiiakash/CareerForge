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

    it('should reject with 429 TOO_MANY_REQUESTS if analysis is currently PROCESSING (concurrency lock)', async () => {
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
