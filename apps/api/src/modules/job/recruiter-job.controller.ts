import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { RecruiterJobsResponseDto } from '../recruiter/dto/recruiter-jobs-response.dto';
import { JobService } from './job.service';

@Controller('recruiters/me/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RECRUITER)
export class RecruiterJobController {

  constructor(private readonly jobService: JobService) {}

  /**
   * 4.3 List Recruiter's Own Jobs
   * GET /api/v1/recruiters/me/jobs
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyJobs(
    @CurrentUser('userId') userId: string
  ): Promise<RecruiterJobsResponseDto> {
    const data = await this.jobService.getJobsByRecruiterUserId(userId);

    return {
      success: true,
      data,
    };
  }
}
