import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApplicationCreatedData,
  ApplicationStatusUpdatedData,
  JobApplicantItem,
  ListJobApplicantsMeta,
  ListStudentApplicationsPaginationMeta,
  StudentApplicationItem,
} from './dto/application-response.dto';
import { ApplyJobDto } from './dto/apply-job.dto';
import { ListJobApplicantsQueryDto } from './dto/list-job-applicants-query.dto';
import { ListStudentApplicationsQueryDto } from './dto/list-student-applications-query.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

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

  /**
   * Retrieves a paginated list of applications for the authenticated student adhering to docs/API.md §2.3.
   * - Derives student profile from authenticated userId.
   * - Filters strictly by student_id to prevent BOLA/IDOR leakage.
   * - Supports optional status filter ('APPLIED' | 'SHORTLISTED' | 'REJECTED').
   * - Orders newest applications first (applied_at desc).
   * - Includes job summary and company_name without leaking internal recruiter/student fields.
   */
  async getStudentApplications(
    userId: string,
    query: ListStudentApplicationsQueryDto
  ): Promise<{
    data: StudentApplicationItem[];
    meta: ListStudentApplicationsPaginationMeta;
  }> {
    const student = await this.prisma.student.findUnique({
      where: { user_id: userId },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Student profile does not exist',
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = {
      student_id: student.id,
    };

    if (query.status) {
      where.status = query.status as ApplicationStatus;
    }

    const [total, applications] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { applied_at: 'desc' },
        include: {
          job: {
            include: {
              company: true,
            },
          },
        },
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const data: StudentApplicationItem[] = applications.map((app) => ({
      application_id: app.id,
      status: app.status,
      applied_at: app.applied_at,
      updated_at: app.updated_at,
      job: {
        id: app.job.id,
        title: app.job.title,
        employment_type: app.job.employment_type,
        company_name: app.job.company.name,
      },
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Retrieves a paginated list of applicants for a job adhering to docs/API.md §8.2.
   * - Derives recruiter profile from authenticated userId.
   * - Enforces job ownership: requesting recruiter must own the job (BOLA/IDOR protection).
   * - Returns 404 if recruiter profile or job does not exist.
   * - Returns 403 if recruiter does not own the job.
   * - Supports status filter ('APPLIED' | 'SHORTLISTED' | 'REJECTED').
   * - Paginated with safe defaults (page=1, limit=10, max=50).
   * - Deterministic order: applied_at desc.
   * - Exposes only documented applicant student/resume fields without data leakage.
   */
  async getJobApplicants(
    userId: string,
    jobId: string,
    query: ListJobApplicantsQueryDto
  ): Promise<{
    data: JobApplicantItem[];
    meta: ListJobApplicantsMeta;
  }> {
    this.validateUuid(jobId, 'jobId');

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

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = {
      job_id: jobId,
    };

    if (query.status) {
      where.status = query.status as ApplicationStatus;
    }

    const [total, applications] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { applied_at: 'desc' },
        include: {
          student: true,
          resume: true,
        },
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const data: JobApplicantItem[] = applications.map((app) => ({
      application_id: app.id,
      student: {
        id: app.student.id,
        first_name: app.student.first_name,
        last_name: app.student.last_name,
        university: app.student.university,
        degree: app.student.degree,
        graduation_year: app.student.graduation_year,
        skills: app.student.skills,
      },
      resume: {
        id: app.resume.id,
        file_url: app.resume.file_url,
      },
      status: app.status,
      applied_at: app.applied_at,
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Updates an application status adhering to docs/API.md §8.3.
   * - Derives recruiter profile from authenticated userId.
   * - Resolves application and its parent job.
   * - Enforces parent job ownership: requesting recruiter must own the job (BOLA/IDOR protection).
   * - Enforces allowed status transitions:
   *     APPLIED -> SHORTLISTED
   *     APPLIED -> REJECTED
   *     SHORTLISTED -> REJECTED
   *   Rejects terminal state transitions and no-op transitions with 400 VALIDATION_ERROR.
   * - Updates status and returns documented response envelope.
   */
  async updateApplicationStatus(
    userId: string,
    id: string,
    dto: UpdateApplicationStatusDto
  ): Promise<ApplicationStatusUpdatedData> {
    this.validateUuid(id, 'id');

    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        job: true,
      },
    });

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Application does not exist',
      });
    }

    if (application.job.recruiter_id !== recruiter.id) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Recruiter does not own the parent job',
      });
    }

    const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> =
      {
        APPLIED: [ApplicationStatus.SHORTLISTED, ApplicationStatus.REJECTED],
        SHORTLISTED: [ApplicationStatus.REJECTED],
        REJECTED: [],
      };

    const allowed = ALLOWED_TRANSITIONS[application.status] || [];
    if (!allowed.includes(dto.status as ApplicationStatus)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Cannot transition application status from ${application.status} to ${dto.status}`,
      });
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: dto.status as ApplicationStatus,
      },
      select: {
        id: true,
        status: true,
        updated_at: true,
      },
    });

    return {
      application_id: updated.id,
      status: updated.status as 'SHORTLISTED' | 'REJECTED',
      updated_at: updated.updated_at,
    };
  }
}
