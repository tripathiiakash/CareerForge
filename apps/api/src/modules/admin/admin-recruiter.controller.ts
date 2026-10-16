import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  approveRecruiterSchema,
  listPendingRecruitersQuerySchema,
  moderateRecruiterStatusSchema,
  requestClarificationSchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AdminRecruiterService } from './admin-recruiter.service';
import {
  ApproveRecruiterDto,
  ListPendingRecruitersQueryDto,
  ListPendingRecruitersResponseDto,
  ModerateRecruiterDto,
  ModerateRecruiterResponseDto,
  RejectRecruiterDto,
  RequestClarificationDto,
} from './dto/admin-recruiter-response.dto';

const uuidPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid id format (must be a valid UUID)',
    }),
});

@Controller('admin/recruiters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminRecruiterController {
  constructor(private readonly adminRecruiterService: AdminRecruiterService) {}

  /**
   * List Pending Recruiters
   * GET /api/v1/admin/recruiters/pending
   */
  @Get('pending')
  @HttpCode(HttpStatus.OK)
  async listPendingRecruiters(
    @Query(new ZodValidationPipe(listPendingRecruitersQuerySchema))
    query: ListPendingRecruitersQueryDto
  ): Promise<ListPendingRecruitersResponseDto> {
    const { data, meta } =
      await this.adminRecruiterService.listPendingRecruiters(query);
    return {
      success: true,
      data,
      meta,
    };
  }

  /**
   * Get Recruiter Verification Details
   * GET /api/v1/admin/recruiters/:id/verification
   */
  @Get(':id/verification')
  @HttpCode(HttpStatus.OK)
  async getRecruiterVerification(@Param('id', uuidPipe) id: string) {
    const data = await this.adminRecruiterService.getRecruiterVerification(id);
    return {
      success: true,
      data,
    };
  }

  /**
   * Request Clarification from Recruiter
   * PATCH /api/v1/admin/recruiters/:id/clarification
   */
  @Patch(':id/clarification')
  @HttpCode(HttpStatus.OK)
  async requestClarification(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(requestClarificationSchema))
    dto: RequestClarificationDto,
    @CurrentUser('userId') adminUserId: string
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.requestClarification(
      id,
      dto,
      adminUserId
    );
    return {
      success: true,
      data,
    };
  }

  /**
   * Approve Recruiter
   * PATCH /api/v1/admin/recruiters/:id/approve
   */
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveRecruiter(
    @Param('id', uuidPipe) id: string,
    @Body() dto?: ApproveRecruiterDto,
    @CurrentUser('userId') adminUserId?: string
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.approveRecruiter(
      id,
      dto,
      adminUserId
    );
    return {
      success: true,
      data,
    };
  }

  /**
   * Reject / Disable Recruiter
   * PATCH /api/v1/admin/recruiters/:id/reject
   */
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectRecruiter(
    @Param('id', uuidPipe) id: string,
    @Body() dto?: RejectRecruiterDto,
    @CurrentUser('userId') adminUserId?: string
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.rejectRecruiter(
      id,
      dto,
      adminUserId
    );
    return {
      success: true,
      data,
    };
  }

  /**
   * Moderate Recruiter Status (Approve / Reject / Clarify via payload)
   * PATCH /api/v1/admin/recruiters/:id/status
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async moderateRecruiterStatus(
    @Param('id', uuidPipe) id: string,
    @Body(new ZodValidationPipe(moderateRecruiterStatusSchema))
    dto: ModerateRecruiterDto,
    @CurrentUser('userId') adminUserId?: string
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.moderateRecruiterStatus(
      id,
      dto,
      adminUserId
    );
    return {
      success: true,
      data,
    };
  }

  /**
   * Download / View Recruiter Evidence Document (Admin review)
   * GET /api/v1/admin/recruiters/:id/evidence
   */
  @Get(':id/evidence')
  async getEvidence(
    @Param('id', uuidPipe) id: string,
    @Res() res: Response
  ): Promise<void> {
    const { buffer, mimeType, originalName } =
      await this.adminRecruiterService.getEvidenceFile(id);

    const safeName = (originalName || 'evidence.pdf').replace(/[^\w.-]/gi, '_');

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader(
      'Cache-Control',
      'private, no-cache, no-store, must-revalidate'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.send(buffer);
  }
}
