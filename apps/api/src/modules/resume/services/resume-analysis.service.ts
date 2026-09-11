import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown per docs/API.md §7.1

@Injectable()
export class ResumeAnalysisService {
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
   * 7.1 Trigger Resume Analysis
   * POST /api/v1/resumes/:resumeId/analyze
   */
  async triggerAnalysis(
    userId: string,
    resumeId: string
  ): Promise<TriggerAnalysisData> {
    this.validateUuid(resumeId);

    // 1. Resolve student profile from authenticated user ID
    const student = await this.studentService.getProfileByUserId(userId);

    // 2. Query resume and its associated analysis
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

    // 4. Verify that parsed text is ready
    if (!resume.parsed_text || resume.parsed_text.trim().length === 0) {
      throw new HttpException(
        {
          code: 'CONFLICT',
          message:
            'Resume text extraction is still in progress. Please wait before triggering analysis.',
        },
        HttpStatus.CONFLICT
      );
    }

    // 5. Enforce concurrency and 5-minute cooldown rules
    if (resume.ai_analysis) {
      if (resume.ai_analysis.status === AnalysisStatus.PROCESSING) {
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            message: 'Please wait before re-analyzing this resume.',
          },
          HttpStatus.TOO_MANY_REQUESTS
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

    // 6. Upsert the AiAnalysis record to state PROCESSING
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
        created_at: new Date(),
      },
    });

    // 7. Enqueue background analysis job
    await this.queueService.send<ResumeAnalysisJobData>(
      QUEUE_NAMES.RESUME_AI_ANALYSIS,
      {
        resumeId,
        studentId: student.id,
      },
      {
        singletonKey: resumeId,
        retryLimit: 2,
        retryDelay: 15,
        retryBackoff: true,
        expireInSeconds: 120,
      }
    );

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
