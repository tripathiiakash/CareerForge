import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './core/config/config.module';
import { QueueModule } from './core/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompanyModule } from './modules/company/company.module';
import { RecruiterModule } from './modules/recruiter/recruiter.module';
import { ResumeModule } from './modules/resume/resume.module';
import { StudentModule } from './modules/student/student.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root application module.
 * ConfigModule and PrismaModule are registered globally here so all domain
 * feature modules (Auth, Profiles, Jobs, Applications, AI, Resumes) can inject ConfigService
 * and PrismaService directly.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    AuthModule,
    StudentModule,
    ResumeModule,
    RecruiterModule,
    CompanyModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
