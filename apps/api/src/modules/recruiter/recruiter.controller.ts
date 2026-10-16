import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  submitRecruiterOrganizationSchema,
  updateRecruiterProfileSchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  RecruiterOrganizationResponseDto,
  SubmitRecruiterOrganizationDto,
} from './dto/recruiter-organization.dto';
import { UploadedFile as IUploadedFile } from './interfaces/uploaded-file.interface';
import { RecruiterProfileResponseDto } from './dto/recruiter-profile-response.dto';
import { UpdateRecruiterProfileDto } from './dto/update-recruiter-profile.dto';
import { RecruiterService } from './recruiter.service';

@Controller('recruiters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RECRUITER)
export class RecruiterController {
  constructor(private readonly recruiterService: RecruiterService) {}

  /**
   * 4.1 Get Current Recruiter Profile
   * GET /api/v1/recruiters/me
   */
  @Get('me')
  async getProfile(
    @CurrentUser('userId') userId: string
  ): Promise<RecruiterProfileResponseDto> {
    const data = await this.recruiterService.getProfileByUserId(userId);
    return {
      success: true,
      data,
    };
  }

  /**
   * 4.2 Update Recruiter Profile
   * PATCH /api/v1/recruiters/me
   */
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(updateRecruiterProfileSchema))
    dto: UpdateRecruiterProfileDto
  ): Promise<RecruiterProfileResponseDto> {
    const data = await this.recruiterService.updateProfileByUserId(userId, dto);
    return {
      success: true,
      data,
    };
  }

  /**
   * 4.3 Get Recruiter Submitted Organization & Verification Status
   * GET /api/v1/recruiters/me/organization
   */
  @Get('me/organization')
  async getOrganizationSubmission(
    @CurrentUser('userId') userId: string
  ): Promise<RecruiterOrganizationResponseDto> {
    const data = await this.recruiterService.getOrganizationSubmission(userId);
    return {
      success: true,
      data,
    };
  }

  /**
   * 4.4 Submit or Update Organization Details for Review
   * PUT /api/v1/recruiters/me/organization
   */
  @Put('me/organization')
  @HttpCode(HttpStatus.OK)
  async submitOrganization(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(submitRecruiterOrganizationSchema))
    dto: SubmitRecruiterOrganizationDto
  ): Promise<RecruiterOrganizationResponseDto> {
    const data = await this.recruiterService.submitOrganization(userId, dto);
    return {
      success: true,
      data,
    };
  }

  /**
   * 4.5 Upload Verification Evidence Document
   * POST /api/v1/recruiters/me/evidence
   */
  @Post('me/evidence')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    })
  )
  async uploadEvidence(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file?: IUploadedFile
  ): Promise<RecruiterOrganizationResponseDto> {
    const data = await this.recruiterService.uploadEvidence(userId, file);
    return {
      success: true,
      data,
    };
  }

  /**
   * 4.6 Download or View Recruiter's Uploaded Evidence File
   * GET /api/v1/recruiters/me/evidence
   */
  @Get('me/evidence')
  async getEvidence(
    @CurrentUser('userId') userId: string,
    @Res() res: Response
  ): Promise<void> {
    const { buffer, mimeType, originalName } =
      await this.recruiterService.getEvidenceFile(userId);

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
