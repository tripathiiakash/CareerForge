import { Module } from '@nestjs/common';
import { QueueModule } from '../../core/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { ApplicationStatusController } from './application-status.controller';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [ApplicationController, ApplicationStatusController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
