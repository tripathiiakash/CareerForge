import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyService } from '../company/company.service';
import { JobService } from '../job/job.service';
import { RecruiterJobItem } from './dto/recruiter-jobs-response.dto';
import { RecruiterProfileData } from './dto/recruiter-profile-response.dto';
import { UpdateRecruiterProfileDto } from './dto/update-recruiter-profile.dto';

@Injectable()
export class RecruiterService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly companyService?: CompanyService,
    @Optional()
    private readonly jobService?: JobService
  ) {}

  /**
   * Retrieves recruiter profile data by associated user ID.
   * Adheres to docs/API.md §4.1.
   */
  async getProfileByUserId(userId: string): Promise<RecruiterProfileData> {
    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            website: true,
            logo_url: true,
          },
        },
      },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    return {
      id: recruiter.id,
      first_name: recruiter.first_name,
      last_name: recruiter.last_name,
      is_approved: recruiter.is_approved,
      company: recruiter.company,
    };
  }

  /**
   * Partially updates recruiter profile data by associated user ID.
   * Adheres to docs/API.md §4.2.
   */
  async updateProfileByUserId(
    userId: string,
    dto: UpdateRecruiterProfileDto
  ): Promise<RecruiterProfileData> {
    const existing = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    // Verify company existence if company_id is provided
    if (dto.company_id !== undefined) {
      const company = this.companyService
        ? await this.companyService.getCompanyById(dto.company_id)
        : await this.prisma.company.findUnique({
            where: { id: dto.company_id },
          });

      if (!company) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Specified company_id does not exist in the companies table',
        });
      }
    }

    const updated = await this.prisma.recruiter.update({
      where: { user_id: userId },
      data: {
        ...(dto.first_name !== undefined && { first_name: dto.first_name }),
        ...(dto.last_name !== undefined && { last_name: dto.last_name }),
        ...(dto.company_id !== undefined && { company_id: dto.company_id }),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            website: true,
            logo_url: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      is_approved: updated.is_approved,
      company: updated.company,
    };
  }

  /**
   * Retrieves all jobs posted by the recruiter associated with the given user ID.
   * Adheres to docs/API.md §4.3.
   * - Scoped strictly to the authenticated recruiter's recruiter_id.
   * - Returns live status from the database.
   * - Does not expose internal audit or recruiter ID fields.
   */
  async getJobsByUserId(userId: string): Promise<RecruiterJobItem[]> {
    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    const jobs = this.jobService
      ? await this.jobService.listJobsByRecruiterId(recruiter.id)
      : await this.prisma.job.findMany({
          where: { recruiter_id: recruiter.id },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            required_skills: true,
            employment_type: true,
            status: true,
            created_at: true,
            company: {
              select: {
                id: true,
                name: true,
                website: true,
                logo_url: true,
              },
            },
          },
        });

    return jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      required_skills: job.required_skills,
      employment_type: job.employment_type,
      status: job.status,
      company: {
        id: job.company.id,
        name: job.company.name,
        website: job.company.website,
        logo_url: job.company.logo_url,
      },
      created_at: job.created_at,
    }));
  }
}
