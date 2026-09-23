/**
 * Log Sanitizer Utility for Production Observability & Security Compliance
 *
 * Ensures that sensitive authentication credentials, tokens, session cookies,
 * API keys, and personal data are never emitted to stdout/stderr or log ingestors.
 */

const SENSITIVE_KEY_REGEX =
  /^(password|password_hash|current_?password|new_?password|token|access_token|refresh_token|secret|jwt_?secret|cookie|cookies|authorization|api_?key|gemini_api_key|resend_api_key|x-goog-api-key|email_body)$/i;

const BEARER_AUTH_REGEX = /Bearer\s+[A-Za-z0-9\-_.+=/]+/gi;
const JWT_REGEX =
  /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.-]+/g;
const COOKIE_AUTH_REGEX = /cf_auth=[^;\s]+/gi;

/**
 * Sanitizes string messages, replacing JWTs, Bearer headers, and session cookies with masked placeholders.
 */
export function sanitizeLogString(str: string): string {
  if (typeof str !== 'string') {
    return str;
  }

  return str
    .replace(BEARER_AUTH_REGEX, 'Bearer [REDACTED]')
    .replace(COOKIE_AUTH_REGEX, 'cf_auth=[REDACTED]')
    .replace(JWT_REGEX, '[REDACTED_JWT]');
}

/**
 * Recursively scrubs sensitive fields from objects and arrays.
 * Handles circular references safely using a WeakSet.
 */
export function sanitizeLogData<T>(input: T, seen = new WeakSet<object>()): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeLogString(input) as unknown as T;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (seen.has(input)) {
    return '[Circular]' as unknown as T;
  }
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeLogData(item, seen)) as unknown as T;
  }

  if (input instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: input.name,
      message: sanitizeLogString(input.message),
      stack: input.stack ? sanitizeLogString(input.stack) : undefined,
    };
    return errorObj as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value, seen);
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeLogString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as unknown as T;
}

/**
 * Structured log record adhering to production JSON log standards.
 */
export interface StructuredLogEntry {
  timestamp: string;
  level: string;
  context?: string;
  message: string;
  metadata?: Record<string, unknown>;
  trace?: string;
}

/**
 * Formats a log record into a single-line sanitized JSON string for production aggregators.
 */
export function formatStructuredJsonLog(
  level: string,
  message: unknown,
  context?: string,
  trace?: string,
  meta?: Record<string, unknown>
): string {
  const sanitizedMessage =
    typeof message === 'string'
      ? sanitizeLogString(message)
      : JSON.stringify(sanitizeLogData(message));

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    context: context || 'Application',
    message: sanitizedMessage,
  };

  if (meta && Object.keys(meta).length > 0) {
    entry.metadata = sanitizeLogData(meta);
  }

  if (trace) {
    entry.trace = sanitizeLogString(trace);
  }

  return JSON.stringify(entry);
}
