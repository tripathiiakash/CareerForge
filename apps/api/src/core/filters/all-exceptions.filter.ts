import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '../config/config.service';

/**
 * Standard API error envelope structure adhering to docs/API.md
 */
interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Global exception filter that catches all unhandled exceptions and HttpExceptions,
 * mapping them into the standardized CareerForge error envelope defined in docs/API.md:
 *
 * {
 *   "success": false,
 *   "error": {
 *     "code": "...",
 *     "message": "...",
 *     "details": [ ... ]
 *   }
 * }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService?: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected internal server error occurred.';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = this.mapStatusToErrorCode(status);

      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if (typeof resObj.code === 'string') {
          code = resObj.code;
        }

        if (Array.isArray(resObj.message)) {
          message = 'Validation failed';
          details = resObj.message;
          code = 'VALIDATION_ERROR';
        } else if (typeof resObj.message === 'string') {
          message = resObj.message;
        }

        if (resObj.details !== undefined) {
          details = resObj.details;
        }
      }

      if (
        status === HttpStatus.PAYLOAD_TOO_LARGE ||
        message === 'File too large'
      ) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        code = 'VALIDATION_ERROR';
        message = 'File exceeds 5MB size limit';
      }
    } else if (
      exception instanceof Error &&
      (exception.name === 'MulterError' ||
        (exception as unknown as Record<string, unknown>).code ===
          'LIMIT_FILE_SIZE')
    ) {
      if (
        (exception as unknown as Record<string, unknown>).code ===
        'LIMIT_FILE_SIZE'
      ) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        code = 'VALIDATION_ERROR';
        message = 'File exceeds 5MB size limit';
      } else {
        status = HttpStatus.BAD_REQUEST;
        code = 'VALIDATION_ERROR';
        message = exception.message || 'File upload validation failed';
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_ERROR';

      const isProduction = this.configService?.isProduction ?? false;
      message = isProduction
        ? 'An unexpected internal server error occurred.'
        : exception.message || 'An unexpected internal server error occurred.';
    }

    // Log the exception
    const logContext = `${request.method} ${request.url}`;
    if (status >= 500) {
      const stack =
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(exception);
      this.logger.error(
        `[${status}] ${code} - ${message} on ${logContext}`,
        stack
      );
    } else {
      this.logger.warn(`[${status}] ${code} - ${message} on ${logContext}`);
    }

    const errorPayload: StandardErrorResponse['error'] = {
      code,
      message,
    };

    if (details !== undefined) {
      errorPayload.details = details;
    }

    response.status(status).json({
      success: false,
      error: errorPayload,
    });
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return 'VALIDATION_ERROR';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.INTERNAL_SERVER_ERROR:
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
