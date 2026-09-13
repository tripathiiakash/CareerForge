import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminUserController, AdminMetricsController],
  providers: [AdminUserService, AdminMetricsService],
  exports: [AdminUserService, AdminMetricsService],
})
export class AdminModule {}
