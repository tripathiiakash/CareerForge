import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminMetricsResponseDto } from './dto/admin-metrics-response.dto';

@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMetricsController {
  constructor(private readonly adminMetricsService: AdminMetricsService) {}

  /**
   * 9.5 Get Platform Metrics
   * GET /api/v1/admin/metrics
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getMetrics(): Promise<AdminMetricsResponseDto> {
    const data = await this.adminMetricsService.getMetrics();
    return {
      success: true,
      data,
    };
  }
}
