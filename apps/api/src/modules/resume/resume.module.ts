import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { ConfigService } from '../../core/config/config.service';
import { QueueModule } from '../../core/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { StudentModule } from '../student/student.module';
import { AI_PROVIDER_TOKEN } from './ai/ai-provider.interface';
import { GeminiProvider } from './ai/gemini.provider';
import { MockAiProvider } from './ai/mock-ai.provider';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { PdfParserService } from './services/pdf-parser.service';
import { ResumeAnalysisService } from './services/resume-analysis.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { ResumeStorageService } from './storage/resume-storage.service';
import { STORAGE_PROVIDER_TOKEN } from './storage/storage.interface';
import { ResumeAnalysisWorker } from './workers/resume-analysis.worker';
import { ResumeExtractionWorker } from './workers/resume-extraction.worker';

@Module({
  imports: [ConfigModule, QueueModule, AuthModule, StudentModule],
  controllers: [ResumeController],
  providers: [
    ResumeService,
    ResumeStorageService,
    LocalStorageProvider,
    PdfParserService,
    ResumeExtractionWorker,
    ResumeAnalysisService,
    ResumeAnalysisWorker,
    GeminiProvider,
    MockAiProvider,
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService) => {
        const apiKey = configService.geminiApiKey;
        if (
          apiKey &&
          apiKey !== 'your-gemini-api-key-here' &&
          !apiKey.startsWith('your-')
        ) {
          return new GeminiProvider(configService);
        }
        return new MockAiProvider();
      },
      inject: [ConfigService],
    },
    {
      provide: STORAGE_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService) => {
        const provider = configService.storageProvider;
        if (provider === 'local') {
          return new LocalStorageProvider(configService);
        }
        throw new Error(
          `Storage provider "${provider}" is not supported yet. Use "local" in development.`
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [ResumeService, ResumeStorageService, ResumeAnalysisService],
})
export class ResumeModule {}
