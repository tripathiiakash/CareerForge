import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentModule } from '../student/student.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';

@Module({
  imports: [AuthModule, StudentModule],
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
