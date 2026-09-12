import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminJobController } from './admin-job.controller';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({
  imports: [AuthModule],
  controllers: [JobController, AdminJobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}
