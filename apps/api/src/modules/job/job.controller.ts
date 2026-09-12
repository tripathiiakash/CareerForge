import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createJobSchema, updateJobSchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { CreateJobDto } from './dto/create-job.dto';
import {
  CreateJobResponseDto,
  DeleteJobResponseDto,
  UpdateJobResponseDto,
} from './dto/job-response.dto';
import { UpdateJobDto } from './dto/update-job.dto';
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

  /**
   * 5.4 Update Job Posting
   * PATCH /api/v1/jobs/:id
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateJob(
    @CurrentUser('userId') userId: string,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        exceptionFactory: () =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Invalid id format (must be a valid UUID)',
          }),
      })
    )
    id: string,
    @Body(new ZodValidationPipe(updateJobSchema)) dto: UpdateJobDto
  ): Promise<UpdateJobResponseDto> {
    const data = await this.jobService.updateJob(userId, id, dto);
    return {
      success: true,
      data,
    };
  }

  /**
   * 5.5 Delete Job Posting
   * DELETE /api/v1/jobs/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteJob(
    @CurrentUser('userId') userId: string,
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
        exceptionFactory: () =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Invalid id format (must be a valid UUID)',
          }),
      })
    )
    id: string
  ): Promise<DeleteJobResponseDto> {
    const result = await this.jobService.deleteJob(userId, id);
    return {
      success: true,
      message: result.message,
    };
  }
}
