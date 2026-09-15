import { Injectable, Logger } from '@nestjs/common';
import {
  IEmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';

export interface SentEmailRecord {
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  from: string;
  replyTo?: string;
  sentAt: Date;
  messageId: string;
}

/**
 * MockEmailProvider records outgoing emails in-memory for testing and local development.
 * Never performs network dispatch or requires third-party credentials.
 */
@Injectable()
export class MockEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(MockEmailProvider.name);
  private sentEmails: SentEmailRecord[] = [];

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const recipients = Array.isArray(options.to)
      ? options.to.map((r) =>
          typeof r === 'string' ? r.trim() : r.email.trim()
        )
      : [
          typeof options.to === 'string'
            ? options.to.trim()
            : options.to.email.trim(),
        ];

    const messageId = `mock-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const record: SentEmailRecord = {
      to: recipients,
      subject: options.subject,
      html: options.html,
      text: options.text,
      from: options.from || 'CareerForge <notifications@careerforge.dev>',
      replyTo: options.replyTo,
      sentAt: new Date(),
      messageId,
    };

    this.sentEmails.push(record);

    this.logger.log(
      `[MockEmailProvider] Recorded mock email to [${recipients.join(', ')}] with subject "${options.subject}" (id: ${messageId})`
    );

    return {
      success: true,
      messageId,
    };
  }

  getSentEmails(): SentEmailRecord[] {
    return [...this.sentEmails];
  }

  getLastEmail(): SentEmailRecord | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  hasSentEmailTo(email: string): boolean {
    const target = email.toLowerCase().trim();
    return this.sentEmails.some((record) =>
      record.to.some((r) => r.toLowerCase().includes(target))
    );
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }

  count(): number {
    return this.sentEmails.length;
  }
}
