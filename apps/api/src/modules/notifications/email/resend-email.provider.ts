import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../core/config/config.service';
import {
  IEmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from './email-provider.interface';
import {
  maskEmailAddress,
  maskEmailsInText,
  maskRecipient,
  sanitizeEmailLogText,
} from './email-sanitizer.util';

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

/**
 * ResendEmailProvider delivers transactional emails via the official Resend HTTP REST API
 * using native fetch. Strictly protects server API credentials from log or error leakage.
 */
@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiUrl = 'https://api.resend.com/emails';

  constructor(private readonly configService: ConfigService) {}

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const apiKey = this.configService.resendApiKey;
    if (
      !apiKey ||
      apiKey === 'your-resend-api-key-here' ||
      apiKey.startsWith('your-')
    ) {
      throw new EmailDeliveryError(
        'RESEND_API_KEY is not configured on the server. Cannot execute email delivery.'
      );
    }

    const from = options.from || this.configService.emailFrom;
    const recipients = this.formatRecipients(options.to);

    const payload: Record<string, unknown> = {
      from,
      to: recipients,
      subject: options.subject,
    };

    if (options.html) {
      payload.html = options.html;
    }
    if (options.text) {
      payload.text = options.text;
    }
    if (options.replyTo) {
      payload.reply_to = options.replyTo;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CareerForge-API/1.0',
    };

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const maskedRecipients = recipients.map((r) => this.maskRecipient(r));

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let safeErrorMessage = `Resend API returned HTTP status ${response.status}`;
        try {
          const errorBody = await response.text();
          const parsed = JSON.parse(errorBody);
          if (parsed && typeof parsed.message === 'string') {
            safeErrorMessage = `Resend API error (${response.status}): ${parsed.message}`;
          }
        } catch {
          // Fallback to generic status message
        }

        // Strictly sanitize any potential occurrence of the API key, tokens, and recipient emails
        safeErrorMessage = sanitizeEmailLogText(safeErrorMessage, [apiKey]);
        const safeSubject = sanitizeEmailLogText(options.subject, [apiKey]);

        this.logger.error(
          `Email delivery failed for subject "${safeSubject}": ${safeErrorMessage}`
        );

        throw new EmailDeliveryError(safeErrorMessage, response.status);
      }

      const responseData = (await response.json()) as { id?: string };
      const messageId = responseData?.id || undefined;

      const safeSubject = maskEmailsInText(options.subject);
      this.logger.log(
        `Email delivered successfully to [${maskedRecipients.join(', ')}] with subject "${safeSubject}" (id: ${messageId || 'unknown'})`
      );

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      if (error instanceof EmailDeliveryError) {
        throw error;
      }

      const rawMessage =
        error instanceof Error ? error.message : 'Unknown network failure';
      const safeMessage = sanitizeEmailLogText(
        `Resend network error: ${rawMessage}`,
        [apiKey]
      );

      this.logger.error(
        `Unexpected error during email delivery to [${maskedRecipients.join(', ')}]: ${safeMessage}`
      );

      throw new EmailDeliveryError(safeMessage);
    }
  }

  private formatRecipients(to: SendEmailOptions['to']): string[] {
    const list = Array.isArray(to) ? to : [to];
    return list.map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      if (item.name && item.name.trim()) {
        return `${item.name.trim()} <${item.email.trim()}>`;
      }
      return item.email.trim();
    });
  }

  private maskRecipient(recipient: string): string {
    return maskRecipient(recipient);
  }

  private maskEmailAddress(email: string): string {
    return maskEmailAddress(email);
  }

  private redactSecret(text: string, secret: string): string {
    return sanitizeEmailLogText(text, [secret]);
  }
}
