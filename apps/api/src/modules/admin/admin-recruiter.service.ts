import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminPendingRecruiterItem,
  ListPendingRecruitersPaginationMeta,
  ListPendingRecruitersQueryDto,
  ModerateRecruiterDto,
  ModerateRecruiterResult,
} from './dto/admin-recruiter-response.dto';

@Injectable()
export class AdminRecruiterService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List pending recruiters awaiting admin approval.
   * GET /api/v1/admin/recruiters/pending
   */
  async listPendingRecruiters(query: ListPendingRecruitersQueryDto): Promise<{
    data: AdminPendingRecruiterItem[];
    meta: ListPendingRecruitersPaginationMeta;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const take = limit;

    const where = {
      is_approved: false,
    };

    const [recruiters, total] = await Promise.all([
      this.prisma.recruiter.findMany({
        where,
        orderBy: [{ user: { created_at: 'desc' } }, { id: 'asc' }],
        skip,
        take,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              website: true,
              logo_url: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              is_banned: true,
              created_at: true,
            },
          },
        },
      }),
      this.prisma.recruiter.count({ where }),
    ]);

    const data: AdminPendingRecruiterItem[] = recruiters.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.user?.email || '',
      is_approved: r.is_approved,
      created_at: r.user?.created_at || new Date(),
      company: r.company
        ? {
            id: r.company.id,
            name: r.company.name,
            website: r.company.website,
            logo_url: r.company.logo_url,
          }
        : null,
      user: r.user
        ? {
            id: r.user.id,
            email: r.user.email,
            is_banned: r.user.is_banned,
            created_at: r.user.created_at,
          }
        : null,
    }));

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

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
   * Approve a recruiter account.
   * PATCH /api/v1/admin/recruiters/:id/approve
   */
  async approveRecruiter(id: string): Promise<ModerateRecruiterResult> {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: {
        company: true,
        user: true,
      },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    const updated = await this.prisma.recruiter.update({
      where: { id: recruiter.id },
      data: { is_approved: true },
    });

    return {
      id: updated.id,
      user_id: updated.user_id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      is_approved: true,
      message: 'Recruiter approved successfully',
    };
  }

  /**
   * Reject / disable a recruiter account.
   * PATCH /api/v1/admin/recruiters/:id/reject
   */
  async rejectRecruiter(id: string): Promise<ModerateRecruiterResult> {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: {
        company: true,
        user: true,
      },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    const updated = await this.prisma.recruiter.update({
      where: { id: recruiter.id },
      data: { is_approved: false },
    });

    return {
      id: updated.id,
      user_id: updated.user_id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      is_approved: false,
      message: 'Recruiter approval rejected',
    };
  }

  /**
   * Moderate recruiter status (Approve or Reject via payload).
   * PATCH /api/v1/admin/recruiters/:id/status
   */
  async moderateRecruiterStatus(
    id: string,
    dto: ModerateRecruiterDto
  ): Promise<ModerateRecruiterResult> {
    const shouldApprove = dto.status === 'APPROVED' || dto.is_approved === true;

    if (shouldApprove) {
      return this.approveRecruiter(id);
    }
    return this.rejectRecruiter(id);
  }
}
