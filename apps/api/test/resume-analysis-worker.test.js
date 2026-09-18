const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  ResumeAnalysisWorker,
  isRetryableAiError,
} = require('../dist/modules/resume/workers/resume-analysis.worker');
const {
  AiProviderError,
} = require('../dist/modules/resume/ai/ai-provider.interface');

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
    retryCount: 0,
    retryLimit: 2,
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

  it('should handle retryable provider failure on non-final attempt: keep status PROCESSING and rethrow for retry', async () => {
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

    let updateCalled = false;
    mockPrisma.aiAnalysis.update = async () => {
      updateCalled = true;
      return {};
    };

    // Non-final attempt: retryCount: 0, retryLimit: 2
    const nonFinalJob = {
      ...sampleJob,
      retryCount: 0,
      retryLimit: 2,
    };

    await assert.rejects(
      () => worker.handleAnalysisJob(nonFinalJob),
      { message: 'Gemini API request failed with status 503' }
    );

    // CRITICAL: DB status must NOT be updated to FAILED prematurely on a retryable attempt!
    assert.equal(updateCalled, false, 'ai_analysis.update should NOT be called on non-final retryable failure');
  });

  it('should handle final retry exhaustion: record FAILED in DB and rethrow for pg-boss terminal failure', async () => {
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

    // Final attempt: retryCount: 2, retryLimit: 2 (attempt 3 of 3)
    const finalJob = {
      ...sampleJob,
      retryCount: 2,
      retryLimit: 2,
    };

    await assert.rejects(
      () => worker.handleAnalysisJob(finalJob),
      { message: 'Gemini API request failed with status 503' }
    );

    // On final attempt exhaustion, status MUST be recorded as FAILED
    assert.ok(updatedData, 'ai_analysis.update should be called on final attempt exhaustion');
    assert.equal(updatedData.status, 'FAILED');
    assert.equal(
      updatedData.error_message,
      'Failed to analyze resume. Please verify resume readability and try again.'
    );
  });

  it('should handle permanent failure (unconfigured API key): record FAILED in DB and do NOT rethrow', async () => {
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
      throw new Error('GEMINI_API_KEY is not configured on the server. Cannot execute AI analysis.');
    };

    let updatedData = null;
    mockPrisma.aiAnalysis.update = async (params) => {
      updatedData = params.data;
      return {};
    };

    // Non-final attempt, but permanent error: should mark FAILED and NOT rethrow
    const job = {
      ...sampleJob,
      retryCount: 0,
      retryLimit: 2,
    };

    // Must NOT reject; resolves cleanly so pg-boss stops retrying
    await assert.doesNotReject(() => worker.handleAnalysisJob(job));

    assert.ok(updatedData);
    assert.equal(updatedData.status, 'FAILED');
    assert.match(updatedData.error_message, /configuration or validation/);
  });

  it('should handle permanent failure (HTTP 400 Bad Request): record FAILED in DB and do NOT rethrow', async () => {
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
      throw new AiProviderError('Gemini API request failed with status 400', 400, false);
    };

    let updatedData = null;
    mockPrisma.aiAnalysis.update = async (params) => {
      updatedData = params.data;
      return {};
    };

    // Must NOT reject
    await assert.doesNotReject(() => worker.handleAnalysisJob(sampleJob));

    assert.ok(updatedData);
    assert.equal(updatedData.status, 'FAILED');
    assert.match(updatedData.error_message, /configuration or validation/);
  });

  it('isRetryableAiError should correctly classify permanent vs transient errors', () => {
    // Permanent errors
    assert.equal(
      isRetryableAiError(new Error('GEMINI_API_KEY is not configured on the server.')),
      false
    );
    assert.equal(
      isRetryableAiError(new AiProviderError('Bad request', 400, false)),
      false
    );
    assert.equal(
      isRetryableAiError(new AiProviderError('Unauthorized', 401, false)),
      false
    );
    assert.equal(
      isRetryableAiError(new AiProviderError('Forbidden', 403, false)),
      false
    );
    assert.equal(
      isRetryableAiError(new Error('Gemini API request failed with status 400')),
      false
    );

    // Retryable errors
    assert.equal(
      isRetryableAiError(new AiProviderError('Rate limited', 429, true)),
      true
    );
    assert.equal(
      isRetryableAiError(new AiProviderError('Server error', 503, true)),
      true
    );
    assert.equal(
      isRetryableAiError(new Error('fetch failed: ECONNRESET')),
      true
    );
    assert.equal(
      isRetryableAiError(new Error('AbortError: The operation was aborted')),
      true
    );
    assert.equal(
      isRetryableAiError(new Error('Gemini API request failed with status 503')),
      true
    );
  });

  it('should be retry-safe: subsequent retry after failure successfully updates status to COMPLETED', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: 'Experienced developer',
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

    // Retry invocation (attempt 2) succeeds
    const retryJob = {
      ...sampleJob,
      retryCount: 1,
      retryLimit: 2,
    };

    await worker.handleAnalysisJob(retryJob);

    assert.equal(updatedData.status, 'COMPLETED');
    assert.equal(updatedData.score, 85);
    assert.equal(updatedData.error_message, null);
  });

  it('QueueService correctly propagates retryCount and retryLimit from pg-boss into JobEnvelope', async () => {
    const { QueueService } = require('../dist/core/queue/queue.service');
    const mockConfig = {
      databaseUrl: 'postgres://localhost:5432/test',
      pgBossSchema: 'pgboss',
    };
    const queueService = new QueueService(mockConfig);
    queueService.createQueue = async () => {};

    let registeredWorkerOptions = null;
    let registeredWorkerHandler = null;

    queueService.boss.work = async (name, options, handler) => {
      registeredWorkerOptions = options;
      registeredWorkerHandler = handler;
    };

    let receivedEnvelope = null;
    await queueService.work('resume-ai-analysis', async (job) => {
      receivedEnvelope = job;
    });

    assert.deepEqual(registeredWorkerOptions, { includeMetadata: true });

    // Simulate pg-boss dispatching a job with retryCount: 1 and retryLimit: 2
    await registeredWorkerHandler({
      id: 'job-abc-123',
      name: 'resume-ai-analysis',
      data: { resumeId: 'res-1', studentId: 'stu-1' },
      retryCount: 1,
      retryLimit: 2,
    });

    assert.ok(receivedEnvelope);
    assert.equal(receivedEnvelope.id, 'job-abc-123');
    assert.equal(receivedEnvelope.name, 'resume-ai-analysis');
    assert.deepEqual(receivedEnvelope.data, { resumeId: 'res-1', studentId: 'stu-1' });
    assert.equal(receivedEnvelope.retryCount, 1);
    assert.equal(receivedEnvelope.retryLimit, 2);
  });

  it('QueueService creates resume-ai-analysis queue with policy: "exclusive"', async () => {
    const { QueueService } = require('../dist/core/queue/queue.service');
    const mockConfig = {
      databaseUrl: 'postgres://localhost:5432/test',
      pgBossSchema: 'pgboss',
    };
    const queueService = new QueueService(mockConfig);

    let createdQueues = [];
    queueService.boss.createQueue = async (name, options) => {
      createdQueues.push({ name, options });
    };

    await queueService.createQueue('resume-ai-analysis');

    assert.equal(createdQueues.length, 1);
    assert.equal(createdQueues[0].name, 'resume-ai-analysis');
    assert.deepEqual(createdQueues[0].options, { policy: 'exclusive' });
  });

  it('QueueService onModuleInit initializes all application queues and sets policy: "exclusive" on resume-ai-analysis', async () => {
    const { QueueService } = require('../dist/core/queue/queue.service');
    const mockConfig = {
      databaseUrl: 'postgres://localhost:5432/test',
      pgBossSchema: 'pgboss',
    };
    const queueService = new QueueService(mockConfig);
    queueService.boss.start = async () => {};

    let createdQueues = {};
    queueService.boss.createQueue = async (name, options) => {
      createdQueues[name] = options;
    };

    await queueService.onModuleInit();

    assert.ok(createdQueues['resume-ai-analysis']);
    assert.deepEqual(createdQueues['resume-ai-analysis'], { policy: 'exclusive' });
  });
});
