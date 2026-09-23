import { Injectable, LoggerService } from '@nestjs/common';
import { formatStructuredJsonLog } from '../utils/log-sanitizer.util';

/**
 * Production JSON Logger Service
 * Emits single-line, structured, sanitized JSON logs to stdout/stderr.
 * Suitable for cloud log collectors (Datadog, AWS CloudWatch, Grafana Loki, Google Cloud Logging).
 */
@Injectable()
export class JsonLoggerService implements LoggerService {
  log(message: unknown, context?: string): void {
    process.stdout.write(
      formatStructuredJsonLog('info', message, context) + '\n'
    );
  }

  error(message: unknown, trace?: string, context?: string): void {
    process.stderr.write(
      formatStructuredJsonLog('error', message, context, trace) + '\n'
    );
  }

  warn(message: unknown, context?: string): void {
    process.stdout.write(
      formatStructuredJsonLog('warn', message, context) + '\n'
    );
  }

  debug(message: unknown, context?: string): void {
    process.stdout.write(
      formatStructuredJsonLog('debug', message, context) + '\n'
    );
  }

  verbose(message: unknown, context?: string): void {
    process.stdout.write(
      formatStructuredJsonLog('verbose', message, context) + '\n'
    );
  }
}
