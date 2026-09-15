import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './core/config/config.module';
import { QueueModule } from './core/queue/queue.module';
import { ApplicationModule } from './modules/application/application.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { JobModule } from './modules/job/job.module';
import { RecruiterModule } from './modules/recruiter/recruiter.module';
import { ResumeModule } from './modules/resume/resume.module';
import { StudentModule } from './modules/student/student.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root application module.
 * ConfigModule and PrismaModule are registered globally here so all domain
 * feature modules (Auth, Profiles, Jobs, Applications, AI, Resumes, Admin) can inject ConfigService
 * and PrismaService directly.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    NotificationModule,
    AuthModule,
    StudentModule,
    ResumeModule,
    RecruiterModule,
    CompanyModule,
    JobModule,
    ApplicationModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
