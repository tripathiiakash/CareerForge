import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { QueueService } from '../../core/queue/queue.service';
import {
  QUEUE_NAMES,
  RecruiterVerificationSubmittedEmailJobData,
} from '../../core/queue/queue.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RecruiterOrganizationData,
  SubmitRecruiterOrganizationDto,
} from './dto/recruiter-organization.dto';
import { RecruiterProfileData } from './dto/recruiter-profile-response.dto';
import { UpdateRecruiterProfileDto } from './dto/update-recruiter-profile.dto';
import { EvidenceStorageService } from './evidence-storage.service';
import { UploadedFile as IUploadedFile } from './interfaces/uploaded-file.interface';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024; // 5MB

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  // PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return true;
  }

  // PNG: \x89PNG (0x89, 0x50, 0x4E, 0x47)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }

  // JPEG: \xFF\xD8\xFF (0xFF, 0xD8, 0xFF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  return false;
}

@Injectable()
export class RecruiterService {
  private readonly logger = new Logger(RecruiterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceStorageService: EvidenceStorageService,
    @Optional()
    private readonly queueService?: QueueService
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
      is_company_assigned: !!recruiter.company?.name?.trim(),
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

    const updated = await this.prisma.recruiter.update({
      where: { user_id: userId },
      data: {
        // company_id is intentionally excluded: only admins may assign a company
        // via PATCH /api/v1/admin/companies/recruiters/:id/assign
        ...(dto.first_name !== undefined && { first_name: dto.first_name }),
        ...(dto.last_name !== undefined && { last_name: dto.last_name }),
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
      is_company_assigned: !!updated.company?.name?.trim(),
    };
  }

  /**
   * Retrieves organization details and verification lifecycle status for current recruiter.
   */
  async getOrganizationSubmission(
    userId: string
  ): Promise<RecruiterOrganizationData> {
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
      recruiter_id: recruiter.id,
      is_approved: recruiter.is_approved,
      is_company_assigned: !!recruiter.company?.name?.trim(),
      company: recruiter.company,
      verification: recruiter.verification
        ? {
            id: recruiter.verification.id,
            recruiter_id: recruiter.verification.recruiter_id,
            organization_name: recruiter.verification.organization_name,
            website_url: recruiter.verification.website_url,
            linkedin_url: recruiter.verification.linkedin_url,
            designation: recruiter.verification.designation,
            description: recruiter.verification.description,
            evidence_file_key: recruiter.verification.evidence_file_key,
            evidence_original_name:
              recruiter.verification.evidence_original_name,
            evidence_mime_type: recruiter.verification.evidence_mime_type,
            evidence_size_bytes: recruiter.verification.evidence_size_bytes,
            status: recruiter.verification.status,
            clarification_message: recruiter.verification.clarification_message,
            clarification_requested_at:
              recruiter.verification.clarification_requested_at,
            rejection_reason: recruiter.verification.rejection_reason,
            reviewed_at: recruiter.verification.reviewed_at,
            created_at: recruiter.verification.created_at,
            updated_at: recruiter.verification.updated_at,
          }
        : null,
    };
  }

  /**
   * Submits or updates organization details for review.
   * If application was in NEEDS_CLARIFICATION, resets status to PENDING.
   * Recruiters cannot self-assign company_id or modify authoritative Company records.
   */
  async submitOrganization(
    userId: string,
    dto: SubmitRecruiterOrganizationDto
  ): Promise<RecruiterOrganizationData> {
    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
      include: { verification: true },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    const orgName = dto.organization_name.trim();
    const websiteUrl = dto.website_url ?? null;
    const linkedinUrl = dto.linkedin_url ?? null;
    const designation = dto.designation ?? null;
    const description = dto.description ?? null;
    const isResubmission = recruiter.verification !== null;

    if (recruiter.verification) {
      // If clarification was requested, resubmission moves status back to PENDING
      const nextStatus =
        recruiter.verification.status === VerificationStatus.NEEDS_CLARIFICATION
          ? VerificationStatus.PENDING
          : recruiter.verification.status;

      await this.prisma.recruiterVerification.update({
        where: { recruiter_id: recruiter.id },
        data: {
          organization_name: orgName,
          website_url: websiteUrl,
          linkedin_url: linkedinUrl,
          designation,
          description,
          status: nextStatus,
        },
      });
    } else {
      await this.prisma.recruiterVerification.create({
        data: {
          recruiter_id: recruiter.id,
          organization_name: orgName,
          website_url: websiteUrl,
          linkedin_url: linkedinUrl,
          designation,
          description,
          status: VerificationStatus.PENDING,
        },
      });
    }

    // Asynchronously dispatch verification submission/resubmission notification via pg-boss
    if (this.queueService) {
      try {
        await this.queueService.send<RecruiterVerificationSubmittedEmailJobData>(
          QUEUE_NAMES.NOTIFICATION_EMAIL_RECRUITER_VERIFICATION_SUBMITTED,
          {
            recruiterId: recruiter.id,
            isResubmission,
          },
          {
            singletonKey: `recruiter-verif-sub:${recruiter.id}:${Date.now()}`,
            retryLimit: 3,
            retryDelay: 15,
            retryBackoff: true,
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown queue error';
        this.logger.error(
          `Failed to enqueue recruiter verification notification for recruiter ${recruiter.id}: ${msg}`
        );
      }
    }

    return this.getOrganizationSubmission(userId);
  }

  /**
   * Uploads verification proof document (PDF, PNG, JPEG, max 5MB).
   */
  async uploadEvidence(
    userId: string,
    file?: IUploadedFile
  ): Promise<RecruiterOrganizationData> {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'No evidence file provided',
      });
    }

    if (file.buffer.length > MAX_EVIDENCE_SIZE) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Evidence document size exceeds 5MB limit',
      });
    }

    const mimeType = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          'Invalid file type. Allowed formats: PDF (.pdf), PNG (.png), JPEG (.jpg, .jpeg)',
      });
    }

    if (!validateMagicBytes(file.buffer, mimeType)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'File contents do not match allowed formats (PDF, PNG, JPEG)',
      });
    }

    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
      include: { company: true, verification: true },
    });

    if (!recruiter) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Recruiter profile does not exist',
      });
    }

    // Save evidence document via storage provider
    const uploadResult = await this.evidenceStorageService.upload({
      buffer: file.buffer,
      mimeType,
      originalName: file.originalname || 'evidence.pdf',
      recruiterId: recruiter.id,
    });

    // Delete previous evidence file if replacing
    if (recruiter.verification?.evidence_file_key) {
      await this.evidenceStorageService.delete(
        recruiter.verification.evidence_file_key
      );
    }

    if (recruiter.verification) {
      const nextStatus =
        recruiter.verification.status === VerificationStatus.NEEDS_CLARIFICATION
          ? VerificationStatus.PENDING
          : recruiter.verification.status;

      await this.prisma.recruiterVerification.update({
        where: { recruiter_id: recruiter.id },
        data: {
          evidence_file_key: uploadResult.fileKey,
          evidence_original_name: uploadResult.originalName,
          evidence_mime_type: uploadResult.mimeType,
          evidence_size_bytes: uploadResult.sizeBytes,
          status: nextStatus,
        },
      });
    } else {
      await this.prisma.recruiterVerification.create({
        data: {
          recruiter_id: recruiter.id,
          organization_name:
            recruiter.company?.name || 'Pending Organization Submission',
          evidence_file_key: uploadResult.fileKey,
          evidence_original_name: uploadResult.originalName,
          evidence_mime_type: uploadResult.mimeType,
          evidence_size_bytes: uploadResult.sizeBytes,
          status: VerificationStatus.PENDING,
        },
      });
    }

    return this.getOrganizationSubmission(userId);
  }

  /**
   * Retrieves recruiter's own uploaded verification evidence for viewing or download.
   */
  async getEvidenceFile(userId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }> {
    const recruiter = await this.prisma.recruiter.findUnique({
      where: { user_id: userId },
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
        message: 'No verification evidence uploaded',
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
