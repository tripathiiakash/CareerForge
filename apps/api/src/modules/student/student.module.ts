import { Module } from '@nestjs/common';
import { ApplicationModule } from '../application/application.module';
import { AuthModule } from '../auth/auth.module';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [AuthModule, ApplicationModule],
  controllers: [StudentController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}
