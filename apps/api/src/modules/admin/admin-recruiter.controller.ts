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
  listPendingRecruitersQuerySchema,
  moderateRecruiterStatusSchema,
} from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AdminRecruiterService } from './admin-recruiter.service';
import {
  ListPendingRecruitersQueryDto,
  ListPendingRecruitersResponseDto,
  ModerateRecruiterDto,
  ModerateRecruiterResponseDto,
} from './dto/admin-recruiter-response.dto';

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
   * Approve Recruiter
   * PATCH /api/v1/admin/recruiters/:id/approve
   */
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveRecruiter(
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
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.approveRecruiter(id);
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
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.rejectRecruiter(id);
    return {
      success: true,
      data,
    };
  }

  /**
   * Moderate Recruiter Status (Approve / Reject via payload)
   * PATCH /api/v1/admin/recruiters/:id/status
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async moderateRecruiterStatus(
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
    @Body(new ZodValidationPipe(moderateRecruiterStatusSchema))
    dto: ModerateRecruiterDto
  ): Promise<ModerateRecruiterResponseDto> {
    const data = await this.adminRecruiterService.moderateRecruiterStatus(
      id,
      dto
    );
    return {
      success: true,
      data,
    };
  }
}
