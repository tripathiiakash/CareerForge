import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AnalysisStatus } from '@prisma/client';
import { QueueService } from '../../../core/queue/queue.service';
import {
  QUEUE_NAMES,
  ResumeAnalysisJobData,
} from '../../../core/queue/queue.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { StudentService } from '../../student/student.service';
import { GetAnalysisData } from '../dto/get-analysis-response.dto';
import { TriggerAnalysisData } from '../dto/trigger-analysis-response.dto';
import { UUID_REGEX } from '../../../core/utils/uuid.util';

export const COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown per docs/API.md §7.1

/**
 * Single active execution window in pg-boss (in seconds).
 * The Gemini API call has a 60s timeout (AbortSignal.timeout(60000)).
 * Setting active expiration to 120 seconds provides a 100% safety buffer for network/payload overhead.
 */
export const ANALYSIS_ACTIVE_EXPIRE_SECONDS = 120; // 2 minutes

/**
 * Retry parameters for AI resume analysis in pg-boss:
 * - retryLimit: 2 (total 3 attempts: initial attempt + 2 retries)
 * - retryDelay: 15 seconds initial delay
 * - retryBackoff: true (exponential backoff with jitter)
 */
export const ANALYSIS_RETRY_LIMIT = 2;
export const ANALYSIS_RETRY_DELAY_SECONDS = 15;

/**
 * Stale PROCESSING recovery threshold in milliseconds.
 *
 * Maximum legitimate retry/backoff lifecycle:
 * - Attempt 1 active: up to 60s
 * - Backoff 1: max 30s (15s base * [1..2] jitter)
 * - Attempt 2 active: up to 60s
 * - Backoff 2: max 60s (30s base * [1..2] jitter)
 * - Attempt 3 active: up to 60s
 * Total normal execution ceiling = 270s (4.5 minutes).
 *
 * Even if an attempt suffers a hard worker process crash taking the full
 * active expiration (120s): 120s + 30s + 60s + 60s + 60s = 330s (5.5 minutes).
 *
 * Setting STALE_PROCESSING_THRESHOLD_MS to 6 minutes (360,000 ms) safely exceeds
 * the maximum legitimate retry lifecycle while ensuring genuinely abandoned jobs recover.
 */
export const STALE_PROCESSING_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes

@Injectable()
export class ResumeAnalysisService {
  private readonly logger = new Logger(ResumeAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
    private readonly queueService: QueueService
  ) {}

  private validateUuid(id: string, fieldName = 'resumeId'): void {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid ${fieldName} format (must be a valid UUID)`,
      });
    }
  }

  /**
   * 7.1 Trigger Resume AI Analysis
   * POST /api/v1/resumes/:resumeId/analyze
   */
  async triggerAnalysis(
    userId: string,
    resumeId: string
  ): Promise<TriggerAnalysisData> {
    this.validateUuid(resumeId);

    // 1. Resolve student profile
    const student = await this.studentService.getProfileByUserId(userId);

    // 2. Fetch resume and verify student ownership
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      include: {
        ai_analysis: true,
      },
    });

    if (!resume) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resume not found.',
      });
    }

    // 3. Verify ownership: must belong to the calling student
    if (resume.student_id !== student.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You are not authorized to analyze this resume.',
      });
    }

    // 4. Verify that parsed text is ready
    if (!resume.parsed_text || resume.parsed_text.trim().length === 0) {
      if (resume.ai_analysis?.status === AnalysisStatus.FAILED) {
        throw new HttpException(
          {
            code: 'UNPROCESSABLE_ENTITY',
            message:
              resume.ai_analysis.error_message ||
              'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.',
          },
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }

      throw new HttpException(
        {
          code: 'CONFLICT',
          message:
            'Resume text extraction is still in progress. Please wait before triggering analysis.',
        },
        HttpStatus.CONFLICT
      );
    }

    // 5. Enforce concurrency, recovery of stale PROCESSING, and 5-minute cooldown rules
    let isStaleProcessing = false;
    if (resume.ai_analysis) {
      if (resume.ai_analysis.status === AnalysisStatus.PROCESSING) {
        const elapsedMs = Date.now() - resume.ai_analysis.created_at.getTime();
        if (elapsedMs < STALE_PROCESSING_THRESHOLD_MS) {
          throw new HttpException(
            {
              code: 'RATE_LIMITED',
              message: 'Please wait before re-analyzing this resume.',
            },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
        isStaleProcessing = true;
        this.logger.warn(
          `Recovering from abandoned PROCESSING analysis for resume ${resumeId} (age: ${Math.round(elapsedMs / 1000)}s)`
        );
      }

      if (resume.ai_analysis.status === AnalysisStatus.COMPLETED) {
        const elapsedMs = Date.now() - resume.ai_analysis.created_at.getTime();
        if (elapsedMs < COOLDOWN_MS) {
          throw new HttpException(
            {
              code: 'RATE_LIMITED',
              message: 'Please wait before re-analyzing this resume.',
            },
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
      }
    }

    // 6. Enqueue background analysis job
    let jobId: string | null = null;
    try {
      jobId = await this.queueService.send<ResumeAnalysisJobData>(
        QUEUE_NAMES.RESUME_AI_ANALYSIS,
        {
          resumeId,
          studentId: student.id,
        },
        {
          singletonKey: resumeId,
          retryLimit: ANALYSIS_RETRY_LIMIT,
          retryDelay: ANALYSIS_RETRY_DELAY_SECONDS,
          retryBackoff: true,
          expireInSeconds: ANALYSIS_ACTIVE_EXPIRE_SECONDS,
        }
      );

      // If recovering from stale PROCESSING and initial send was deduplicated,
      // supervise the queue to transition any expired active jobs and retry once
      if (!jobId && isStaleProcessing && typeof this.queueService.supervise === 'function') {
        this.logger.warn(
          `Stale recovery for resume ${resumeId} collided with existing job in queue. Supervising queue to clear expired jobs...`
        );
        try {
          await this.queueService.supervise();
          jobId = await this.queueService.send<ResumeAnalysisJobData>(
            QUEUE_NAMES.RESUME_AI_ANALYSIS,
            {
              resumeId,
              studentId: student.id,
            },
            {
              singletonKey: resumeId,
              retryLimit: ANALYSIS_RETRY_LIMIT,
              retryDelay: ANALYSIS_RETRY_DELAY_SECONDS,
              retryBackoff: true,
              expireInSeconds: ANALYSIS_ACTIVE_EXPIRE_SECONDS,
            }
          );
        } catch (superviseErr) {
          this.logger.warn(
            `Queue supervision during stale recovery failed for resume ${resumeId}: ${superviseErr}`
          );
        }
      }
    } catch (enqueueError) {
      this.logger.error(
        `Failed to enqueue AI analysis job for resume ${resumeId}`,
        enqueueError
      );
      // Mark as FAILED so student is not locked out for 6 minutes
      await this.prisma.aiAnalysis
        .update({
          where: { resume_id: resumeId },
          data: {
            status: AnalysisStatus.FAILED,
            error_message:
              'Failed to schedule analysis job. Please try again.',
          },
        })
        .catch(() => {});
      throw new HttpException(
        {
          code: 'QUEUE_ERROR',
          message: 'Failed to schedule analysis job. Please try again.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    // 7. Upsert the AiAnalysis record in database
    // CRITICAL (Finding-05): Only reset created_at when a new job was actually enqueued (jobId !== null).
    // If deduplicated against an active/retrying singleton (jobId === null), preserve the existing created_at
    // so the stale recovery clock is NOT falsely restarted.
    if (jobId) {
      this.logger.log(
        `Enqueued resume AI analysis job ${jobId} for resume ${resumeId}`
      );
      await this.prisma.aiAnalysis.upsert({
        where: { resume_id: resumeId },
        create: {
          resume_id: resumeId,
          status: AnalysisStatus.PROCESSING,
          created_at: new Date(),
        },
        update: {
          status: AnalysisStatus.PROCESSING,
          score: null,
          missing_skills: [],
          formatting_tips: [],
          error_message: null,
          created_at: new Date(),
        },
      });
    } else {
      this.logger.warn(
        `Job for resume ${resumeId} was deduplicated by queue exclusive policy (job already created/active/retrying in pg-boss). Preserving original created_at timestamp.`
      );
      await this.prisma.aiAnalysis.upsert({
        where: { resume_id: resumeId },
        create: {
          resume_id: resumeId,
          status: AnalysisStatus.PROCESSING,
        },
        update: {
          status: AnalysisStatus.PROCESSING,
          score: null,
          missing_skills: [],
          formatting_tips: [],
          error_message: null,
          // Note: created_at is intentionally omitted to preserve existing analysis age
        },
      });
    }

    return {
      resume_id: resumeId,
      status: 'PROCESSING',
      message: 'Resume analysis enqueued.',
    };
  }

  /**
   * 7.2 Get Resume Analysis Results
   * GET /api/v1/resumes/:resumeId/analysis
   */
  async getAnalysis(
    userId: string,
    resumeId: string
  ): Promise<GetAnalysisData> {
    this.validateUuid(resumeId);

    // 1. Resolve student profile from authenticated user ID
    const student = await this.studentService.getProfileByUserId(userId);

    // 2. Query resume and existing analysis
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      include: { ai_analysis: true },
    });

    if (!resume) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resume does not exist',
      });
    }

    // 3. Enforce student ownership
    if (resume.student_id !== student.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Resume belongs to a different student',
      });
    }

    // 4. Check if analysis has ever been triggered
    if (!resume.ai_analysis) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resume analysis has not been triggered for this resume.',
      });
    }

    const analysis = resume.ai_analysis;

    // 5. Map based on status
    if (analysis.status === AnalysisStatus.PROCESSING) {
      return {
        status: 'PROCESSING',
        analysis: null,
      };
    }

    if (analysis.status === AnalysisStatus.COMPLETED) {
      return {
        status: 'COMPLETED',
        analysis: {
          score: analysis.score ?? 0,
          missing_skills: analysis.missing_skills,
          formatting_tips: analysis.formatting_tips,
          created_at: analysis.created_at.toISOString(),
        },
      };
    }

    return {
      status: 'FAILED',
      error_message:
        analysis.error_message ||
        'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.',
      analysis: null,
    };
  }
}
