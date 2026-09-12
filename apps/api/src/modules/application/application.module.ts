import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApplicationStatusController } from './application-status.controller';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationController, ApplicationStatusController],
  providers: [ApplicationService],
  exports: [ApplicationService, ApplicationStatusController],
})
export class ApplicationModule {}
