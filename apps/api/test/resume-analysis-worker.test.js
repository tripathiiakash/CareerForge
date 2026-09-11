const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  ResumeAnalysisWorker,
} = require('../dist/modules/resume/workers/resume-analysis.worker');

describe('ResumeAnalysisWorker Test Suite', () => {
  let worker;
  let mockQueueService;
  let mockPrisma;
  let mockAiProvider;

  const resumeId = '11111111-1111-4111-8111-111111111111';
  const studentId = '22222222-2222-4222-8222-222222222222';
  const sampleJob = {
    id: 'job-999',
    name: 'resume-ai-analysis',
    data: { resumeId, studentId },
  };

  beforeEach(() => {
    mockQueueService = {
      work: async () => {},
    };

    mockPrisma = {
      resume: {
        findUnique: async () => null,
      },
      aiAnalysis: {
        update: async () => {},
      },
    };

    mockAiProvider = {
      analyzeResume: async () => ({
        score: 85,
        missingSkills: ['Kubernetes'],
        formattingTips: ['Quantify metrics'],
      }),
    };

    worker = new ResumeAnalysisWorker(
      mockQueueService,
      mockPrisma,
      mockAiProvider
    );
  });

  it('should skip job if resume does not exist in the database', async () => {
    mockPrisma.resume.findUnique = async () => null;

    let aiProviderCalled = false;
    mockAiProvider.analyzeResume = async () => {
      aiProviderCalled = true;
    };

    await worker.handleAnalysisJob(sampleJob);
    assert.equal(aiProviderCalled, false);
  });

  it('should skip job if student ID does not match resume owner in database', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: 'different-student-id',
      parsed_text: 'Resume text',
    });

    let aiProviderCalled = false;
    mockAiProvider.analyzeResume = async () => {
      aiProviderCalled = true;
    };

    await worker.handleAnalysisJob(sampleJob);
    assert.equal(aiProviderCalled, false);
  });

  it('should mark analysis as FAILED if parsed_text is missing or empty', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: '',
    });

    let updatedData = null;
    mockPrisma.aiAnalysis.update = async (params) => {
      updatedData = params.data;
      return {};
    };

    await worker.handleAnalysisJob(sampleJob);

    assert.equal(updatedData.status, 'FAILED');
    assert.ok(
      updatedData.error_message.includes('Failed to parse resume text')
    );
  });

  it('should skip duplicate processing if analysis was already COMPLETED within 5 minutes (idempotency)', async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: 'Experienced developer',
      ai_analysis: {
        status: 'COMPLETED',
        score: 90,
        created_at: twoMinutesAgo,
      },
    });

    let aiProviderCalled = false;
    mockAiProvider.analyzeResume = async () => {
      aiProviderCalled = true;
    };

    await worker.handleAnalysisJob(sampleJob);
    assert.equal(aiProviderCalled, false);
  });

  it('should process job successfully, invoke AI provider, and persist COMPLETED results', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: 'Experienced TypeScript and Node.js developer',
      ai_analysis: {
        status: 'PROCESSING',
        created_at: new Date(),
      },
    });

    let updatedData = null;
    mockPrisma.aiAnalysis.update = async (params) => {
      updatedData = params.data;
      return {};
    };

    await worker.handleAnalysisJob(sampleJob);

    assert.equal(updatedData.status, 'COMPLETED');
    assert.equal(updatedData.score, 85);
    assert.deepEqual(updatedData.missing_skills, ['Kubernetes']);
    assert.deepEqual(updatedData.formatting_tips, ['Quantify metrics']);
    assert.equal(updatedData.error_message, null);
    assert.ok(
      updatedData.created_at instanceof Date,
      'created_at should be updated to completion timestamp'
    );
  });

  it('should handle provider failure safely: record FAILED in DB and rethrow for pg-boss retry', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: 'Experienced developer',
      ai_analysis: {
        status: 'PROCESSING',
        created_at: new Date(),
      },
    });

    mockAiProvider.analyzeResume = async () => {
      throw new Error('Gemini API request failed with status 503');
    };

    let updatedData = null;
    mockPrisma.aiAnalysis.update = async (params) => {
      updatedData = params.data;
      return {};
    };

    await assert.rejects(
      () => worker.handleAnalysisJob(sampleJob),
      { message: 'Gemini API request failed with status 503' }
    );

    assert.equal(updatedData.status, 'FAILED');
    assert.equal(
      updatedData.error_message,
      'Failed to analyze resume. Please verify resume readability and try again.'
    );
  });

  it('should be retry-safe: subsequent retry after failure successfully updates status to COMPLETED', async () => {
    // Resume has existing FAILED status from a prior failed attempt
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: 'Experienced developer',
      ai_analysis: {
        status: 'FAILED',
        error_message: 'Previous network timeout',
        created_at: new Date(),
      },
    });

    let updatedData = null;
    mockPrisma.aiAnalysis.update = async (params) => {
      updatedData = params.data;
      return {};
    };

    // Retry invocation succeeds
    await worker.handleAnalysisJob(sampleJob);

    assert.equal(updatedData.status, 'COMPLETED');
    assert.equal(updatedData.score, 85);
    assert.equal(updatedData.error_message, null);
  });
});
