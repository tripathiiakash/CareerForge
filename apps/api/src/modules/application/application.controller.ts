import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  applyJobSchema,
  listJobApplicantsQuerySchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { ApplicationService } from './application.service';
import {
  ApplyJobResponseDto,
  ListJobApplicantsResponseDto,
} from './dto/application-response.dto';
import { ApplyJobDto } from './dto/apply-job.dto';
import { ListJobApplicantsQueryDto } from './dto/list-job-applicants-query.dto';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  /**
   * 8.1 Apply to a Job
   * POST /api/v1/jobs/:jobId/apply
   */
  @Post(':jobId/apply')
  @HttpCode(HttpStatus.CREATED)
  async applyToJob(
    @CurrentUser('userId') userId: string,
    @Param(
      'jobId',
      new ParseUUIDPipe({
        version: '4',
        exceptionFactory: () =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Invalid jobId format (must be a valid UUID)',
          }),
      })
    )
    jobId: string,
    @Body(new ZodValidationPipe(applyJobSchema)) dto: ApplyJobDto
  ): Promise<ApplyJobResponseDto> {
    const data = await this.applicationService.applyToJob(userId, jobId, dto);
    return {
      success: true,
      data,
    };
  }

  /**
   * 8.2 Get Applicants for a Job
   * GET /api/v1/jobs/:jobId/applicants
   */
  @Get(':jobId/applicants')
  @Roles(UserRole.RECRUITER)
  @HttpCode(HttpStatus.OK)
  async getJobApplicants(
    @CurrentUser('userId') userId: string,
    @Param(
      'jobId',
      new ParseUUIDPipe({
        version: '4',
        exceptionFactory: () =>
          new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'Invalid jobId format (must be a valid UUID)',
          }),
      })
    )
    jobId: string,
    @Query(new ZodValidationPipe(listJobApplicantsQuerySchema))
    query: ListJobApplicantsQueryDto
  ): Promise<ListJobApplicantsResponseDto> {
    const { data, meta } = await this.applicationService.getJobApplicants(
      userId,
      jobId,
      query
    );
    return {
      success: true,
      data,
      meta,
    };
  }
}
