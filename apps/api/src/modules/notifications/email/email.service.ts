import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_PROVIDER_TOKEN,
  IEmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';

/**
 * EmailService provides a domain-agnostic interface for dispatching transactional emails.
 * Delegates delivery exclusively to the configured IEmailProvider abstraction.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: IEmailProvider
  ) {}

  /**
   * Validates email payload options and delegates dispatch to the configured email provider.
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    this.validateOptions(options);
    return this.emailProvider.send(options);
  }

  /**
   * Validates baseline invariants required for transactional email delivery.
   */
  private validateOptions(options: SendEmailOptions): void {
    if (!options) {
      throw new Error('Email options must be provided');
    }

    if (!options.to) {
      throw new Error('Email recipient (to) is required');
    }

    if (Array.isArray(options.to) && options.to.length === 0) {
      throw new Error('At least one email recipient must be specified');
    }

    if (!options.subject || !options.subject.trim()) {
      throw new Error('Email subject is required');
    }

    if (!options.html && !options.text) {
      throw new Error('Email body content (html or text) must be provided');
    }
  }
}
