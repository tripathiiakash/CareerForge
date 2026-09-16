import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { ConfigService } from '../../core/config/config.service';
import { QueueModule } from '../../core/queue/queue.module';
import {
  EMAIL_PROVIDER_TOKEN,
  IEmailProvider,
} from './email/email-provider.interface';
import { EmailService } from './email/email.service';
import { MockEmailProvider } from './email/mock-email.provider';
import { ResendEmailProvider } from './email/resend-email.provider';
import { NotificationEmailWorker } from './workers/notification-email.worker';

@Module({
  imports: [ConfigModule, QueueModule],
  providers: [
    EmailService,
    MockEmailProvider,
    ResendEmailProvider,
    NotificationEmailWorker,
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService): IEmailProvider => {
        const choice = configService.emailProvider?.toLowerCase();
        const apiKey = configService.resendApiKey;

        if (
          choice === 'resend' ||
          (!choice &&
            apiKey &&
            apiKey !== 'your-resend-api-key-here' &&
            !apiKey.startsWith('your-'))
        ) {
          if (
            !apiKey ||
            apiKey === 'your-resend-api-key-here' ||
            apiKey.startsWith('your-')
          ) {
            throw new Error(
              'RESEND_API_KEY is required when EMAIL_PROVIDER is configured as "resend"'
            );
          }
          return new ResendEmailProvider(configService);
        }

        return new MockEmailProvider();
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    EmailService,
    EMAIL_PROVIDER_TOKEN,
    MockEmailProvider,
    ResendEmailProvider,
    NotificationEmailWorker,
  ],
})
export class NotificationModule {}
