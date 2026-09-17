import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, JobStatus } from '@prisma/client';
import { interviewPrepOutputSchema } from '@careerforge/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentService } from '../student/student.service';
import {
  IInterviewPrepProvider,
  INTERVIEW_PREP_PROVIDER_TOKEN,
} from './ai/interview-prep-provider.interface';
import { InterviewPrepData } from './dto/interview-prep-response.dto';
import {
  IInterviewPrepQuotaStore,
  INTERVIEW_PREP_QUOTA_STORE_TOKEN,
} from './quota/interview-prep-quota.interface';
import { UUID_REGEX } from '../../core/utils/uuid.util';

@Injectable()
export class InterviewPrepService {
  private readonly logger = new Logger(InterviewPrepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentService: StudentService,
    @Inject(INTERVIEW_PREP_PROVIDER_TOKEN)
    private readonly aiProvider: IInterviewPrepProvider,
    @Inject(INTERVIEW_PREP_QUOTA_STORE_TOKEN)
    private readonly quotaStore: IInterviewPrepQuotaStore
  ) {}

  private validateUuid(id: string, fieldName = 'jobId'): void {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid ${fieldName} format (must be a valid UUID)`,
      });
    }
  }

  /**
   * 5.6 Generate AI Interview Preparation
   * POST /api/v1/jobs/:jobId/interview-prep
   *
   * Executes the concurrency-safe 12-stage interview preparation pipeline:
   * 1. JWT auth (handled by JwtAuthGuard)
   * 2. STUDENT role check (handled by RolesGuard)
   * 3. UUID validation
   * 4. ACTIVE job check
   * 5. Student application ownership check
   * 6. APPLIED / SHORTLISTED application status check
   * 7. Concurrency-safe atomic PostgreSQL reservation before calling LLM
   * 8. Student skills + job context synthesis
   * 9. Gemini LLM generation
   * 10. Exactly 5 questions schema validation
   * 11. Provider failure refund if error occurs
   * 12. Standard response envelope
   */
  async generateInterviewPrep(
    userId: string,
    jobId: string,
    dateOverride?: string
  ): Promise<InterviewPrepData> {
    // Stage 3: UUID validation
    this.validateUuid(jobId, 'jobId');

    // Stage 4: ACTIVE job check
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job || job.status !== JobStatus.ACTIVE) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Job does not exist',
      });
    }

    // Stage 5: Student application ownership check
    const student = await this.studentService.getProfileByUserId(userId);
    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Student profile does not exist',
      });
    }

    const application = await this.prisma.application.findUnique({
      where: {
        job_id_student_id: {
          job_id: jobId,
          student_id: student.id,
        },
      },
    });

    if (!application) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          "Student has not applied to this job, or application status is 'REJECTED'",
      });
    }

    // Stage 6: APPLIED / SHORTLISTED only check
    if (
      application.status !== ApplicationStatus.APPLIED &&
      application.status !== ApplicationStatus.SHORTLISTED
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          "Student has not applied to this job, or application status is 'REJECTED'",
      });
    }

    // Stage 7: Concurrency-safe atomic quota reservation in PostgreSQL BEFORE Gemini
    const todayUtc = dateOverride || new Date().toISOString().slice(0, 10);
    const reservation = await this.quotaStore.reserveSlot(
      student.id,
      job.id,
      todayUtc
    );

    if (!reservation) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Daily interview prep limit reached (max 3/day)',
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Stage 8: Student skills + job context synthesis
    const input = {
      jobTitle: job.title,
      jobDescription: job.description,
      requiredSkills: job.required_skills,
      employmentType: job.employment_type,
      studentSkills: student.skills || [],
    };

    // Stage 9 & 10: Gemini LLM generation with failure refund handling
    try {
      this.logger.log(
        `Generating interview prep for student ${student.id} on job ${job.id}...`
      );
      const result = await this.aiProvider.generateQuestions(input);

      // Stage 10: Validate exactly 5 questions
      const validated = interviewPrepOutputSchema.parse(result);
      if (!validated.questions || validated.questions.length !== 5) {
        throw new Error(
          'Interview prep provider did not return exactly 5 questions'
        );
      }

      // Stage 11: Return response payload (reservation remains in PostgreSQL)
      return {
        job_title: job.title,
        questions: validated.questions,
      };
    } catch (error: unknown) {
      // If provider or network fails, refund the reserved slot so student can retry
      this.logger.warn(
        `Interview prep generation failed for student ${student.id}. Refunding reservation ${reservation.reservationId}...`
      );
      await this.quotaStore.refundSlot(reservation.reservationId);
      throw error;
    }
  }
}
