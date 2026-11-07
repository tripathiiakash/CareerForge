import { Module } from '@nestjs/common';
import { QueueModule } from '../../core/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { ResumeModule } from '../resume/resume.module';
import { EvidenceStorageService } from './evidence-storage.service';
import { RecruiterController } from './recruiter.controller';
import { RecruiterService } from './recruiter.service';

@Module({
  imports: [AuthModule, ResumeModule, QueueModule],
  controllers: [RecruiterController],
  providers: [RecruiterService, EvidenceStorageService],
  exports: [RecruiterService, EvidenceStorageService],
})
export class RecruiterModule {}
