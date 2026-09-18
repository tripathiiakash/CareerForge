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
  idempotencyKey?: string;
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

    // Provider-level idempotency emulation: return cached result if idempotencyKey matches
    if (options.idempotencyKey) {
      const existing = this.sentEmails.find(
        (r) => r.idempotencyKey === options.idempotencyKey
      );
      if (existing) {
        this.logger.log(
          `[MockEmailProvider] Idempotent replay detected for key "${options.idempotencyKey}". Returning cached messageId (${existing.messageId})`
        );
        return {
          success: true,
          messageId: existing.messageId,
        };
      }
    }

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
      idempotencyKey: options.idempotencyKey,
    };

    this.sentEmails.push(record);

    const maskedRecipients = recipients.map((r) => this.maskRecipient(r));

    this.logger.log(
      `[MockEmailProvider] Recorded mock email to [${maskedRecipients.join(', ')}] with subject "${options.subject}" (id: ${messageId}${options.idempotencyKey ? `, idempotencyKey: ${options.idempotencyKey}` : ''})`
    );

    return {
      success: true,
      messageId,
    };
  }

  private maskRecipient(recipient: string): string {
    const angleMatch = recipient.match(/^(.*)<([^>]+)>$/);
    if (angleMatch) {
      const name = angleMatch[1].trim();
      const email = angleMatch[2].trim();
      return `${name} <${this.maskEmailAddress(email)}>`;
    }
    return this.maskEmailAddress(recipient.trim());
  }

  private maskEmailAddress(email: string): string {
    if (!email || !email.includes('@')) return '[REDACTED]';
    const parts = email.split('@');
    const local = parts[0];
    const domain = parts.slice(1).join('@');
    if (local.length <= 2) {
      return `${local[0] || '*'}***@${domain}`;
    }
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
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

  getSentEmailByIdempotencyKey(key: string): SentEmailRecord | undefined {
    return this.sentEmails.find((r) => r.idempotencyKey === key);
  }

  hasSentEmailWithIdempotencyKey(key: string): boolean {
    return this.sentEmails.some((r) => r.idempotencyKey === key);
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }

  count(): number {
    return this.sentEmails.length;
  }
}
