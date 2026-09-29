import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminMetricsController } from './admin-metrics.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminRecruiterController } from './admin-recruiter.controller';
import { AdminRecruiterService } from './admin-recruiter.service';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminUserController,
    AdminMetricsController,
    AdminRecruiterController,
  ],
  providers: [
    AdminUserService,
    AdminMetricsService,
    AdminBootstrapService,
    AdminRecruiterService,
  ],
  exports: [
    AdminUserService,
    AdminMetricsService,
    AdminBootstrapService,
    AdminRecruiterService,
  ],
})
export class AdminModule {}
