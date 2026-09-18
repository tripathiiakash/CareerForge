import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AnalysisStatus } from '@prisma/client';
import { QueueService } from '../../../core/queue/queue.service';
import {
  JobEnvelope,
  QUEUE_NAMES,
  ResumeAnalysisJobData,
} from '../../../core/queue/queue.types';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AI_PROVIDER_TOKEN,
  AiProviderError,
  IAiProvider,
} from '../ai/ai-provider.interface';
import { COOLDOWN_MS } from '../services/resume-analysis.service';

/**
 * Classifies an error from the AI analysis workflow into retryable or non-retryable.
 * - Permanent/Non-retryable: Missing API key/configuration, permanent 4xx responses (400, 401, 403, 404).
 * - Retryable: Rate limits (429), 5xx server errors, network timeouts/aborts, and transient runtime failures.
 */
export function isRetryableAiError(error: unknown): boolean {
  if (error instanceof AiProviderError) {
    return error.isRetryable;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('gemini_api_key is not configured') ||
      msg.includes('api key is not configured')
    ) {
      return false;
    }
    const status = (error as any).statusCode || (error as any).status;
    if (typeof status === 'number') {
      if (status >= 400 && status < 500 && status !== 429) {
        return false;
      }
    }
    if (
      msg.includes('status 400') ||
      msg.includes('status 401') ||
      msg.includes('status 403') ||
      msg.includes('status 404')
    ) {
      return false;
    }
  }
  return true;
}

@Injectable()
export class ResumeAnalysisWorker implements OnModuleInit {
  private readonly logger = new Logger(ResumeAnalysisWorker.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER_TOKEN)
    private readonly aiProvider: IAiProvider
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `Registering worker for queue: ${QUEUE_NAMES.RESUME_AI_ANALYSIS}`
    );
    await this.queueService.work<ResumeAnalysisJobData>(
      QUEUE_NAMES.RESUME_AI_ANALYSIS,
      this.handleAnalysisJob.bind(this)
    );
  }

  async handleAnalysisJob(
    job: JobEnvelope<ResumeAnalysisJobData>
  ): Promise<void> {
    const { resumeId, studentId } = job.data;
    const retryCount = job.retryCount ?? 0;
    const retryLimit = job.retryLimit ?? 2;
    this.logger.log(
      `Processing resume AI analysis for resume ${resumeId} (job: ${job.id}, attempt: ${retryCount + 1}/${retryLimit + 1})`
    );

    try {
      // 1. Fetch resume and existing analysis
      const resume = await this.prisma.resume.findUnique({
        where: { id: resumeId },
        include: { ai_analysis: true },
      });

      if (!resume) {
        this.logger.warn(
          `Resume ${resumeId} not found in database. Skipping job ${job.id}.`
        );
        return;
      }

      // 2. Validate student ownership
      if (resume.student_id !== studentId) {
        this.logger.warn(
          `Resume ${resumeId} ownership mismatch. Job student: ${studentId}, DB student: ${resume.student_id}. Skipping job ${job.id}.`
        );
        return;
      }

      // 3. Verify parsed text exists
      if (!resume.parsed_text || resume.parsed_text.trim().length === 0) {
        this.logger.warn(
          `Resume ${resumeId} has no parsed text. Marking analysis as FAILED.`
        );
        await this.markAnalysisFailed(
          resumeId,
          'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.'
        );
        return;
      }

      // 4. Idempotency guard: if already completed recently, skip duplicate processing
      if (
        resume.ai_analysis &&
        resume.ai_analysis.status === AnalysisStatus.COMPLETED
      ) {
        const elapsedMs = Date.now() - resume.ai_analysis.created_at.getTime();
        if (elapsedMs < COOLDOWN_MS) {
          this.logger.log(
            `Resume ${resumeId} already has completed analysis. Skipping duplicate job ${job.id}.`
          );
          return;
        }
      }

      // 5. Invoke AI Provider
      const analysisResult = await this.aiProvider.analyzeResume({
        resumeText: resume.parsed_text,
      });

      // 6. Persist structured completed result
      await this.prisma.aiAnalysis.update({
        where: { resume_id: resumeId },
        data: {
          status: AnalysisStatus.COMPLETED,
          score: analysisResult.score,
          missing_skills: analysisResult.missingSkills,
          formatting_tips: analysisResult.formattingTips,
          error_message: null,
          created_at: new Date(),
        },
      });

      this.logger.log(
        `Successfully completed AI analysis for resume ${resumeId} (score: ${analysisResult.score})`
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isFinalAttempt = retryCount >= retryLimit;
      const retryable = isRetryableAiError(error);

      // Case 1: Permanent/non-retryable failure (e.g. unconfigured key, 4xx error)
      if (!retryable) {
        this.logger.warn(
          `Non-retryable failure for resume ${resumeId} (attempt ${retryCount + 1}): ${errorMessage}. Recording FAILED state.`
        );
        await this.markAnalysisFailed(
          resumeId,
          'Failed to analyze resume due to a configuration or validation issue.'
        );
        // Do NOT rethrow; job completes terminally without wasting retry attempts
        return;
      }

      // Case 2: Final retry exhausted
      if (isFinalAttempt) {
        this.logger.error(
          `AI analysis failed and retries exhausted for resume ${resumeId} (attempt ${retryCount + 1}/${retryLimit + 1}): ${errorMessage}. Recording FAILED state.`
        );
        await this.markAnalysisFailed(
          resumeId,
          'Failed to analyze resume. Please verify resume readability and try again.'
        );
        // Rethrow so pg-boss marks the job as failed in queue state
        throw error;
      }

      // Case 3: Transient/retryable failure on non-final attempt
      this.logger.warn(
        `Transient failure during AI analysis for resume ${resumeId} (attempt ${retryCount + 1}/${retryLimit + 1}): ${errorMessage}. Retrying via pg-boss backoff...`
      );
      // Keep status as PROCESSING in DB to prevent concurrent student re-triggers
      // Rethrow so pg-boss executes the next retry attempt
      throw error;
    }
  }

  private async markAnalysisFailed(
    resumeId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await this.prisma.aiAnalysis.update({
        where: { resume_id: resumeId },
        data: {
          status: AnalysisStatus.FAILED,
          error_message: errorMessage,
        },
      });
    } catch (dbError) {
      this.logger.error(
        `Failed to update AiAnalysis status to FAILED for ${resumeId}: ${dbError}`
      );
    }
  }
}
