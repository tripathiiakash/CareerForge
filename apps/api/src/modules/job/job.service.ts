import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmploymentType, JobStatus } from '@prisma/client';
import { sanitizeHtml } from '../../core/utils/sanitize-html.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobCreatedData } from './dto/job-response.dto';

@Injectable()
export class JobService {
  constructor(private readonly prisma: PrismaService) {}

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
}
