export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailOptions {
  to: string | EmailRecipient | (string | EmailRecipient)[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailProvider {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}

export const EMAIL_PROVIDER_TOKEN = Symbol('EMAIL_PROVIDER_TOKEN');
