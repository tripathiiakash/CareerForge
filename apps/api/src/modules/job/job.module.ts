import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { ConfigService } from '../../core/config/config.service';
import { AuthModule } from '../auth/auth.module';
import { StudentModule } from '../student/student.module';
import { ApplicationModule } from '../application/application.module';
import { AdminJobController } from './admin-job.controller';
import { INTERVIEW_PREP_PROVIDER_TOKEN } from './ai/interview-prep-provider.interface';
import { GeminiInterviewPrepProvider } from './ai/gemini-interview-prep.provider';
import { MockInterviewPrepProvider } from './ai/mock-interview-prep.provider';
import { InterviewPrepService } from './interview-prep.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { INTERVIEW_PREP_QUOTA_STORE_TOKEN } from './quota/interview-prep-quota.interface';
import { PostgresInterviewPrepQuotaStore } from './quota/postgres-interview-prep-quota.store';

@Module({
  imports: [AuthModule, StudentModule, ConfigModule, ApplicationModule],
  controllers: [JobController, AdminJobController],
  providers: [
    JobService,
    InterviewPrepService,
    GeminiInterviewPrepProvider,
    MockInterviewPrepProvider,
    PostgresInterviewPrepQuotaStore,
    {
      provide: INTERVIEW_PREP_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService) => {
        const apiKey = configService.geminiApiKey;
        if (
          apiKey &&
          apiKey !== 'your-gemini-api-key-here' &&
          !apiKey.startsWith('your-')
        ) {
          return new GeminiInterviewPrepProvider(configService);
        }
        return new MockInterviewPrepProvider();
      },
      inject: [ConfigService],
    },
    {
      provide: INTERVIEW_PREP_QUOTA_STORE_TOKEN,
      useClass: PostgresInterviewPrepQuotaStore,
    },
  ],
  exports: [JobService, InterviewPrepService],
})
export class JobModule {}
