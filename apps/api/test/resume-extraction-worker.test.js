const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { UnprocessableEntityException } = require('@nestjs/common');
const {
  ResumeExtractionWorker,
} = require('../dist/modules/resume/workers/resume-extraction.worker');

describe('ResumeExtractionWorker Test Suite', () => {
  let worker;
  let mockQueueService;
  let mockPrisma;
  let mockStorageService;
  let mockPdfParserService;

  const resumeId = '11111111-1111-4111-8111-111111111111';
  const studentId = '22222222-2222-4222-8222-222222222222';
  const fileKey = 'test-file.pdf';
  const sampleJob = {
    id: 'job-101',
    name: 'resume-text-extraction',
    data: { resumeId, studentId, fileKey },
  };

  beforeEach(() => {
    mockQueueService = {
      work: async () => {},
    };

    mockPrisma = {
      resume: {
        findUnique: async () => ({
          id: resumeId,
          student_id: studentId,
          file_url: `http://localhost:5000/uploads/resumes/${fileKey}`,
          parsed_text: null,
        }),
        update: async () => ({ id: resumeId }),
      },
      aiAnalysis: {
        upsert: async () => ({ id: 'analysis-1' }),
      },
    };

    mockStorageService = {
      getFileBuffer: async () => Buffer.from('%PDF-1.7 mock content'),
    };

    mockPdfParserService = {
      extractText: async () => 'John Doe - Software Engineer Experience with TypeScript',
    };

    worker = new ResumeExtractionWorker(
      mockQueueService,
      mockPrisma,
      mockStorageService,
      mockPdfParserService
    );
  });

  it('A. should process job successfully, extract text, and update resume parsed_text', async () => {
    let updatedData = null;
    mockPrisma.resume.update = async ({ where, data }) => {
      updatedData = { where, data };
      return { id: where.id, ...data };
    };

    await worker.handleExtractionJob(sampleJob);

    assert.ok(updatedData);
    assert.equal(updatedData.where.id, resumeId);
    assert.equal(
      updatedData.data.parsed_text,
      'John Doe - Software Engineer Experience with TypeScript'
    );
  });

  it('B. should handle EMPTY_PDF_CONTENT as non-retriable: record FAILED in ai_analyses and not rethrow', async () => {
    mockPdfParserService.extractText = async () => {
      throw new UnprocessableEntityException({
        code: 'EMPTY_PDF_CONTENT',
        message: 'The PDF document contains no readable text (it may be image-only or scanned).',
      });
    };

    let upsertCalledWith = null;
    mockPrisma.aiAnalysis.upsert = async (args) => {
      upsertCalledWith = args;
      return { id: 'analysis-failed' };
    };

    let resumeUpdateCalled = false;
    mockPrisma.resume.update = async () => {
      resumeUpdateCalled = true;
    };

    // Must resolve cleanly without throwing, so pg-boss marks job handled
    await assert.doesNotReject(() => worker.handleExtractionJob(sampleJob));

    assert.ok(upsertCalledWith);
    assert.equal(upsertCalledWith.where.resume_id, resumeId);
    assert.equal(upsertCalledWith.create.status, 'FAILED');
    assert.match(upsertCalledWith.create.error_message, /image scan/);
    assert.equal(resumeUpdateCalled, false);
  });

  it('C. should handle INVALID_PDF_FORMAT as non-retriable: record FAILED in ai_analyses and not rethrow', async () => {
    mockPdfParserService.extractText = async () => {
      throw new UnprocessableEntityException({
        code: 'INVALID_PDF_FORMAT',
        message: 'Failed to extract text from PDF document.',
      });
    };

    let upsertCalledWith = null;
    mockPrisma.aiAnalysis.upsert = async (args) => {
      upsertCalledWith = args;
      return { id: 'analysis-failed' };
    };

    await assert.doesNotReject(() => worker.handleExtractionJob(sampleJob));

    assert.ok(upsertCalledWith);
    assert.equal(upsertCalledWith.create.status, 'FAILED');
    assert.match(upsertCalledWith.create.error_message, /image scan/);
  });

  it('D. should rethrow transient storage failures for pg-boss backoff and retry', async () => {
    mockStorageService.getFileBuffer = async () => {
      throw new Error('EAI_AGAIN: DNS lookup failed or storage timeout');
    };

    let aiAnalysisUpsertCalled = false;
    mockPrisma.aiAnalysis.upsert = async () => {
      aiAnalysisUpsertCalled = true;
    };

    await assert.rejects(
      () => worker.handleExtractionJob(sampleJob),
      (err) => {
        assert.match(err.message, /DNS lookup failed/);
        return true;
      }
    );

    // Should NOT mark as FAILED in ai_analyses on transient errors
    assert.equal(aiAnalysisUpsertCalled, false);
  });

  it('should skip job if resume does not exist in database', async () => {
    mockPrisma.resume.findUnique = async () => null;

    let storageCalled = false;
    mockStorageService.getFileBuffer = async () => {
      storageCalled = true;
    };

    await worker.handleExtractionJob(sampleJob);
    assert.equal(storageCalled, false);
  });

  it('should skip job if student ID mismatch (ownership check)', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: 'different-student-uuid',
      file_url: 'http://localhost/test.pdf',
    });

    let storageCalled = false;
    mockStorageService.getFileBuffer = async () => {
      storageCalled = true;
    };

    await worker.handleExtractionJob(sampleJob);
    assert.equal(storageCalled, false);
  });

  it('should skip parsing if parsed_text is already populated (idempotency)', async () => {
    mockPrisma.resume.findUnique = async () => ({
      id: resumeId,
      student_id: studentId,
      parsed_text: 'Already parsed resume text',
    });

    let storageCalled = false;
    mockStorageService.getFileBuffer = async () => {
      storageCalled = true;
    };

    await worker.handleExtractionJob(sampleJob);
    assert.equal(storageCalled, false);
  });
});
