import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateApplicationStatusSchema } from '@careerforge/validation';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { ApplicationService } from './application.service';
import { UpdateApplicationStatusResponseDto } from './dto/application-response.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.RECRUITER)
export class ApplicationStatusController {
  constructor(private readonly applicationService: ApplicationService) {}

  /**
   * 8.3 Update Application Status
   * PATCH /api/v1/applications/:id/status
   */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateApplicationStatus(
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
    @Body(new ZodValidationPipe(updateApplicationStatusSchema))
    dto: UpdateApplicationStatusDto
  ): Promise<UpdateApplicationStatusResponseDto> {
    const data = await this.applicationService.updateApplicationStatus(
      userId,
      id,
      dto
    );
    return {
      success: true,
      data,
    };
  }
}
