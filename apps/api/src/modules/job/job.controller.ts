import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createJobSchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateJobResponseDto } from './dto/job-response.dto';
import { JobService } from './job.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RECRUITER)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  /**
   * 5.1 Create Job Posting
   * POST /api/v1/jobs
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createJob(
    @CurrentUser('userId') userId: string,
    @Body(new ZodValidationPipe(createJobSchema)) dto: CreateJobDto
  ): Promise<CreateJobResponseDto> {
    const data = await this.jobService.createJob(userId, dto);
    return {
      success: true,
      data,
    };
  }
}
