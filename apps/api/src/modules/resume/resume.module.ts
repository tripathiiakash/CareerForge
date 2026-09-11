import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { ConfigService } from '../../core/config/config.service';
import { QueueModule } from '../../core/queue/queue.module';
import { AuthModule } from '../auth/auth.module';
import { StudentModule } from '../student/student.module';
import { ResumeController } from './resume.controller';
import { ResumeService } from './resume.service';
import { PdfParserService } from './services/pdf-parser.service';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { ResumeStorageService } from './storage/resume-storage.service';
import { STORAGE_PROVIDER_TOKEN } from './storage/storage.interface';
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
  exports: [ResumeService, ResumeStorageService],
})
export class ResumeModule {}
