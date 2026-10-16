import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EvidenceStorageService } from './evidence-storage.service';
import { RecruiterController } from './recruiter.controller';
import { RecruiterService } from './recruiter.service';

@Module({
  imports: [AuthModule],
  controllers: [RecruiterController],
  providers: [RecruiterService, EvidenceStorageService],
  exports: [RecruiterService, EvidenceStorageService],
})
export class RecruiterModule {}
