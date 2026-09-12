import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationCreatedData } from './dto/application-response.dto';
import { ApplyJobDto } from './dto/apply-job.dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  private validateUuid(id: string, fieldName: string): void {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid ${fieldName} format (must be a valid UUID)`,
      });
    }
  }

  /**
   * Applies to a job adhering to docs/API.md §8.1.
   * - Derives student identity from authenticated user_id.
   * - Validates target job exists and has status = 'ACTIVE'.
   * - Validates resume exists and belongs to the authenticated student (BOLA/IDOR protection).
   * - Enforces unique constraint on (job_id, student_id) preventing duplicate applications.
   * - Defaults initial application status to APPLIED.
   */
  async applyToJob(
    userId: string,
    jobId: string,
    dto: ApplyJobDto
  ): Promise<ApplicationCreatedData> {
    this.validateUuid(jobId, 'jobId');
    this.validateUuid(dto.resume_id, 'resume_id');

    const student = await this.prisma.student.findUnique({
      where: { user_id: userId },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Student profile does not exist',
      });
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Job does not exist',
      });
    }

    if (job.status !== JobStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Job is not in ACTIVE status',
      });
    }

    const resume = await this.prisma.resume.findUnique({
      where: { id: dto.resume_id },
    });

    if (!resume) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Resume does not exist',
      });
    }

    if (resume.student_id !== student.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Resume does not belong to the authenticated student',
      });
    }

    const existingApplication = await this.prisma.application.findUnique({
      where: {
        job_id_student_id: {
          job_id: jobId,
          student_id: student.id,
        },
      },
    });

    if (existingApplication) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Student has already applied to this job',
      });
    }

    try {
      const application = await this.prisma.application.create({
        data: {
          job_id: jobId,
          student_id: student.id,
          resume_id: dto.resume_id,
          status: ApplicationStatus.APPLIED,
        },
      });

      return {
        application_id: application.id,
        status: 'APPLIED',
        applied_at: application.applied_at,
        message: 'Successfully applied to the job.',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Student has already applied to this job',
        });
      }
      throw error;
    }
  }
}
