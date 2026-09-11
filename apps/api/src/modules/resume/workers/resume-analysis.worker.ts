import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AnalysisStatus } from '@prisma/client';
import { QueueService } from '../../../core/queue/queue.service';
import {
  JobEnvelope,
  QUEUE_NAMES,
  ResumeAnalysisJobData,
} from '../../../core/queue/queue.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { AI_PROVIDER_TOKEN, IAiProvider } from '../ai/ai-provider.interface';

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
    this.logger.log(
      `Processing resume AI analysis for resume ${resumeId} (job: ${job.id})`
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
        await this.prisma.aiAnalysis.update({
          where: { resume_id: resumeId },
          data: {
            status: AnalysisStatus.FAILED,
            error_message:
              'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.',
          },
        });
        return;
      }

      // 4. Idempotency guard: if already completed recently, skip duplicate processing
      if (
        resume.ai_analysis &&
        resume.ai_analysis.status === AnalysisStatus.COMPLETED
      ) {
        const elapsedMs = Date.now() - resume.ai_analysis.created_at.getTime();
        if (elapsedMs < 5 * 60 * 1000) {
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
        },
      });

      this.logger.log(
        `Successfully completed AI analysis for resume ${resumeId} (score: ${analysisResult.score})`
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process AI analysis for resume ${resumeId}: ${errorMessage}`
      );

      // Persist FAILED status so user GET returns failed state
      try {
        await this.prisma.aiAnalysis.update({
          where: { resume_id: resumeId },
          data: {
            status: AnalysisStatus.FAILED,
            error_message:
              'Failed to analyze resume. Please verify resume readability and try again.',
          },
        });
      } catch (dbError) {
        this.logger.error(
          `Failed to update AiAnalysis status to FAILED for ${resumeId}: ${dbError}`
        );
      }

      // Rethrow to allow pg-boss to manage retries/backoff
      throw error;
    }
  }
}
