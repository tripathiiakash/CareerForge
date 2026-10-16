import { Injectable, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EvidenceStorageService } from '../recruiter/evidence-storage.service';
import {
  AdminPendingRecruiterItem,
  ListPendingRecruitersPaginationMeta,
  ListPendingRecruitersQueryDto,
  ModerateRecruiterDto,
  ModerateRecruiterResult,
  RejectRecruiterDto,
  RequestClarificationDto,
} from './dto/admin-recruiter-response.dto';

@Injectable()
export class AdminRecruiterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceStorageService: EvidenceStorageService
  ) {}

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
          verification: true,
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
      verification: r.verification
        ? {
            id: r.verification.id,
            organization_name: r.verification.organization_name,
            website_url: r.verification.website_url,
            linkedin_url: r.verification.linkedin_url,
            designation: r.verification.designation,
            description: r.verification.description,
            evidence_file_key: r.verification.evidence_file_key,
            evidence_original_name: r.verification.evidence_original_name,
            evidence_mime_type: r.verification.evidence_mime_type,
            evidence_size_bytes: r.verification.evidence_size_bytes,
            status: r.verification.status,
            clarification_message: r.verification.clarification_message,
            clarification_requested_at:
              r.verification.clarification_requested_at,
            rejection_reason: r.verification.rejection_reason,
            reviewed_at: r.verification.reviewed_at,
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
   * Retrieves full verification details for a recruiter by recruiter id or user id.
   */
  async getRecruiterVerification(id: string) {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: {
        company: true,
        user: {
          select: {
            id: true,
            email: true,
            is_banned: true,
            created_at: true,
          },
        },
        verification: true,
      },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    return {
      recruiter: {
        id: recruiter.id,
        user_id: recruiter.user_id,
        first_name: recruiter.first_name,
        last_name: recruiter.last_name,
        email: recruiter.user?.email || '',
        is_approved: recruiter.is_approved,
        company: recruiter.company,
      },
      verification: recruiter.verification,
    };
  }

  /**
   * Request clarification from recruiter with required actionable guidance.
   * PATCH /api/v1/admin/recruiters/:id/clarification
   */
  async requestClarification(
    id: string,
    dto: RequestClarificationDto,
    adminUserId?: string
  ): Promise<ModerateRecruiterResult> {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: {
        verification: true,
        company: true,
      },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    const message = dto.message.trim();

    if (this.prisma.recruiterVerification) {
      if (recruiter.verification) {
        await this.prisma.recruiterVerification.update({
          where: { recruiter_id: recruiter.id },
          data: {
            status: VerificationStatus.NEEDS_CLARIFICATION,
            clarification_message: message,
            clarification_requested_at: new Date(),
            reviewed_by_id: adminUserId || null,
            reviewed_at: new Date(),
          },
        });
      } else {
        await this.prisma.recruiterVerification.create({
          data: {
            recruiter_id: recruiter.id,
            organization_name:
              recruiter.company?.name || 'Unspecified Organization',
            status: VerificationStatus.NEEDS_CLARIFICATION,
            clarification_message: message,
            clarification_requested_at: new Date(),
            reviewed_by_id: adminUserId || null,
            reviewed_at: new Date(),
          },
        });
      }
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
      status: 'NEEDS_CLARIFICATION',
      message: 'Clarification requested successfully',
    };
  }

  /**
   * Approve a recruiter account.
   * PATCH /api/v1/admin/recruiters/:id/approve
   */
  async approveRecruiter(
    id: string,
    adminUserId?: string
  ): Promise<ModerateRecruiterResult> {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: {
        company: true,
        user: true,
        verification: true,
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

    if (this.prisma.recruiterVerification && recruiter.verification) {
      await this.prisma.recruiterVerification.update({
        where: { recruiter_id: recruiter.id },
        data: {
          status: VerificationStatus.APPROVED,
          reviewed_by_id: adminUserId || null,
          reviewed_at: new Date(),
        },
      });
    }

    return {
      id: updated.id,
      user_id: updated.user_id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      is_approved: true,
      status: 'APPROVED',
      message: 'Recruiter approved successfully',
    };
  }

  /**
   * Reject / disable a recruiter account.
   * PATCH /api/v1/admin/recruiters/:id/reject
   */
  async rejectRecruiter(
    id: string,
    dto?: RejectRecruiterDto,
    adminUserId?: string
  ): Promise<ModerateRecruiterResult> {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: {
        company: true,
        user: true,
        verification: true,
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

    const rejectionReason =
      dto?.reason?.trim() || 'Application rejected by administrator';

    if (this.prisma.recruiterVerification) {
      if (recruiter.verification) {
        await this.prisma.recruiterVerification.update({
          where: { recruiter_id: recruiter.id },
          data: {
            status: VerificationStatus.REJECTED,
            rejection_reason: rejectionReason,
            reviewed_by_id: adminUserId || null,
            reviewed_at: new Date(),
          },
        });
      } else {
        await this.prisma.recruiterVerification.create({
          data: {
            recruiter_id: recruiter.id,
            organization_name:
              recruiter.company?.name || 'Unspecified Organization',
            status: VerificationStatus.REJECTED,
            rejection_reason: rejectionReason,
            reviewed_by_id: adminUserId || null,
            reviewed_at: new Date(),
          },
        });
      }
    }

    return {
      id: updated.id,
      user_id: updated.user_id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      is_approved: false,
      status: 'REJECTED',
      message: 'Recruiter approval rejected',
    };
  }

  /**
   * Moderate recruiter status (Approve, Reject, or Request Clarification via payload).
   * PATCH /api/v1/admin/recruiters/:id/status
   */
  async moderateRecruiterStatus(
    id: string,
    dto: ModerateRecruiterDto,
    adminUserId?: string
  ): Promise<ModerateRecruiterResult> {
    if (dto.status === 'APPROVED' || dto.is_approved === true) {
      return this.approveRecruiter(id, adminUserId);
    }

    if (dto.status === 'NEEDS_CLARIFICATION') {
      return this.requestClarification(
        id,
        {
          message:
            dto.message ||
            'Please update your organization details or upload supporting proof.',
        },
        adminUserId
      );
    }

    return this.rejectRecruiter(
      id,
      {
        reason:
          dto.reason ||
          'Application could not be verified by platform administrator.',
      },
      adminUserId
    );
  }

  /**
   * Retrieves recruiter's uploaded verification evidence document for admin review.
   */
  async getEvidenceFile(id: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }> {
    const recruiter = await this.prisma.recruiter.findFirst({
      where: {
        OR: [{ id }, { user_id: id }],
      },
      include: { verification: true },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    if (!recruiter.verification || !recruiter.verification.evidence_file_key) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'No verification evidence uploaded for this recruiter',
      });
    }

    const buffer = await this.evidenceStorageService.getBuffer(
      recruiter.verification.evidence_file_key
    );

    return {
      buffer,
      mimeType:
        recruiter.verification.evidence_mime_type || 'application/octet-stream',
      originalName:
        recruiter.verification.evidence_original_name || 'evidence.pdf',
    };
  }
}
