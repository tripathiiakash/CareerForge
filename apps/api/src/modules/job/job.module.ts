import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({
  imports: [AuthModule],
  controllers: [JobController],
  providers: [JobService],
  exports: [JobService],
})
export class JobModule {}
