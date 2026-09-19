/**
 * Centralized utility for sanitizing and masking PII (Personally Identifiable Information)
 * and sensitive credentials from email-related log messages and error reports.
 */

/**
 * Masks an email address into the safe standard pattern:
 * e.g. "john.doe@example.com" -> "j***e@example.com"
 * e.g. "a@b.com" -> "a***@b.com"
 * e.g. invalid string -> "[REDACTED]"
 */
export function maskEmailAddress(email: string): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return '[REDACTED]';
  }
  const parts = email.trim().split('@');
  const local = parts[0];
  const domain = parts.slice(1).join('@');
  if (!domain) {
    return '[REDACTED]';
  }
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Masks a single recipient string which may optionally include a display name:
 * e.g. "John Doe <john.doe@example.com>" -> "John Doe <j***e@example.com>"
 * e.g. "john.doe@example.com" -> "j***e@example.com"
 */
export function maskRecipient(recipient: string): string {
  if (!recipient || typeof recipient !== 'string') {
    return '[REDACTED]';
  }
  const angleMatch = recipient.match(/^(.*)<([^>]+)>$/);
  if (angleMatch) {
    const name = angleMatch[1].trim();
    const email = angleMatch[2].trim();
    return `${name} <${maskEmailAddress(email)}>`;
  }
  return maskEmailAddress(recipient.trim());
}

/**
 * Replaces any plain or embedded email addresses in arbitrary text with masked versions.
 */
export function maskEmailsInText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return text.replace(emailRegex, (match) => maskEmailAddress(match));
}

/**
 * Comprehensive sanitization for email provider logs, errors, and diagnostic outputs.
 * Strictly redacts:
 * 1. Explicit secrets/API keys passed in `secretsToRedact`
 * 2. Authorization headers and Bearer tokens
 * 3. Cookie headers
 * 4. Any embedded email addresses
 */
export function sanitizeEmailLogText(
  text: string,
  secretsToRedact?: (string | undefined)[]
): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // 1. Redact explicit secrets (e.g. Resend API key)
  if (secretsToRedact && secretsToRedact.length > 0) {
    for (const secret of secretsToRedact) {
      if (secret && typeof secret === 'string' && secret.length >= 4) {
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED]');
      }
    }
  }

  // 2. Redact Authorization Bearer tokens
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9_\-.]+/gi,
    'Bearer [REDACTED]'
  );

  // 3. Redact Cookie / Set-Cookie headers
  sanitized = sanitized.replace(/Cookie:\s*[^;\r\n]+/gi, 'Cookie: [REDACTED]');

  // 4. Mask all embedded email addresses
  sanitized = maskEmailsInText(sanitized);

  return sanitized;
}
