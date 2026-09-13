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
  UseGuards,
} from '@nestjs/common';
import {
  listPendingJobsQuerySchema,
  moderateJobStatusSchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import {
  ListPendingJobsResponseDto,
  ModerateJobStatusResponseDto,
} from './dto/job-response.dto';
import { ListPendingJobsQueryDto } from './dto/list-pending-jobs-query.dto';
import { ModerateJobStatusDto } from './dto/moderate-job-status.dto';
import { JobService } from './job.service';

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminJobController {
  constructor(private readonly jobService: JobService) {}

  /**
   * 9.1 List Pending Jobs for Moderation
   * GET /api/v1/admin/jobs/pending
   */
  @Get('pending')
  @HttpCode(HttpStatus.OK)
  async listPendingJobs(
    @Query(new ZodValidationPipe(listPendingJobsQuerySchema))
    query: ListPendingJobsQueryDto
  ): Promise<ListPendingJobsResponseDto> {
    const { data, meta } = await this.jobService.listPendingJobs(query);
    return {
      success: true,
      data,
      meta,
    };
  }

  /**
   * 9.2 Moderate Job Status (Approve / Reject)
   * PATCH /api/v1/admin/jobs/:id/status
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async moderateJobStatus(
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
    @Body(new ZodValidationPipe(moderateJobStatusSchema))
    dto: ModerateJobStatusDto
  ): Promise<ModerateJobStatusResponseDto> {
    const data = await this.jobService.moderateJobStatus(id, dto);
    return {
      success: true,
      data,
    };
  }
}
