import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './core/config/config.module';
import { SecurityHeadersMiddleware } from './core/middleware/security-headers.middleware';
import { CsrfMiddleware } from './core/middleware/csrf.middleware';
import { QueueModule } from './core/queue/queue.module';
import { RateLimitModule } from './core/rate-limit/rate-limit.module';
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
 * ConfigModule, PrismaModule, and RateLimitModule are registered globally here so all domain
 * feature modules can inject them directly.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueueModule,
    RateLimitModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(SecurityHeadersMiddleware, CsrfMiddleware)
      .forRoutes('*');
  }
}
