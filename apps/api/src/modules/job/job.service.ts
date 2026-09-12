import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentType, JobStatus } from '@prisma/client';
import { sanitizeHtml } from '../../core/utils/sanitize-html.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobCreatedData, JobUpdatedData } from './dto/job-response.dto';
import { UpdateJobDto } from './dto/update-job.dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

  private validateUuid(id: string, fieldName = 'jobId'): void {
    if (!id || !UUID_REGEX.test(id)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Invalid ${fieldName} format (must be a valid UUID)`,
      });
    }
  }

  /**
   * Creates a new job posting adhering to docs/API.md §5.1.
   * - Enforces recruiter ownership via authenticated userId.
   * - Verifies the recruiter has a valid linked company.
   * - Sanitizes description against stored XSS.
   * - Defaults initial status to PENDING awaiting admin approval.
   */
  async createJob(userId: string, dto: CreateJobDto): Promise<JobCreatedData> {
    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
      include: { company: true },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    if (
      !recruiter.company_id ||
      !recruiter.company ||
      !recruiter.company.name ||
      recruiter.company.name.trim() === ''
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Recruiter has no linked company',
      });
    }

    const sanitizedDescription = sanitizeHtml(dto.description.trim());

    const job = await this.prisma.job.create({
      data: {
        recruiter_id: recruiter.id,
        company_id: recruiter.company_id,
        title: dto.title.trim(),
        description: sanitizedDescription,
        required_skills: dto.required_skills.map((s) => s.trim()),
        employment_type: dto.employment_type as EmploymentType,
        status: JobStatus.PENDING,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      id: job.id,
      status: 'PENDING',
      message: 'Job created and pending admin approval.',
    };
  }

  /**
   * Updates an existing job posting adhering to docs/API.md §5.4.
   * - Enforces recruiter ownership via authenticated userId.
   * - Ensures the authenticated recruiter owns the job.
   * - Sanitizes description against stored XSS when provided.
   * - Preserves existing status and internal fields.
   */
  async updateJob(
    userId: string,
    jobId: string,
    dto: UpdateJobDto
  ): Promise<JobUpdatedData> {
    this.validateUuid(jobId);

    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
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

    if (job.recruiter_id !== recruiter.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Recruiter does not own this job',
      });
    }

    const updateData: {
      title?: string;
      description?: string;
      required_skills?: string[];
      employment_type?: EmploymentType;
    } = {};

    if (dto.title !== undefined) {
      updateData.title = dto.title.trim();
    }

    if (dto.description !== undefined) {
      updateData.description = sanitizeHtml(dto.description.trim());
    }

    if (dto.required_skills !== undefined) {
      updateData.required_skills = dto.required_skills.map((s) => s.trim());
    }

    if (dto.employment_type !== undefined) {
      updateData.employment_type = dto.employment_type as EmploymentType;
    }

    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: updateData,
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    return {
      id: updatedJob.id,
      title: updatedJob.title,
      status: updatedJob.status,
      message: 'Job updated successfully.',
    };
  }

  /**
   * Deletes an existing job posting adhering to docs/API.md §5.5.
   * - Enforces recruiter ownership via authenticated userId.
   * - Ensures the authenticated recruiter owns the job.
   * - Safely removes associated applications to preserve relational integrity.
   */
  async deleteJob(userId: string, jobId: string): Promise<{ message: string }> {
    this.validateUuid(jobId);

    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
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

    if (job.recruiter_id !== recruiter.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Recruiter does not own this job',
      });
    }

    if (this.prisma.$transaction) {
      await this.prisma.$transaction(async (tx) => {
        if (tx.application) {
          await tx.application.deleteMany({
            where: { job_id: jobId },
          });
        }
        await tx.job.delete({
          where: { id: jobId },
        });
      });
    } else {
      await this.prisma.job.delete({
        where: { id: jobId },
      });
    }

    return {
      message: 'Job deleted successfully.',
    };
  }
}
