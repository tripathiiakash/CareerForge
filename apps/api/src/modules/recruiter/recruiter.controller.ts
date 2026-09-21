import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateRecruiterProfileSchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
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
}
