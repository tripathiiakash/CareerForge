import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Validates request input against a Zod schema.
 * Formats errors into the standardized API error envelope format specified in docs/API.md:
 * {
 *   "code": "VALIDATION_ERROR",
 *   "message": "Validation failed",
 *   "details": [{ "field": "email", "issue": "Must be a valid email format" }]
 * }
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // Skip validation for custom parameter decorators (e.g. @CurrentUser)
    if (metadata.type === 'custom') {
      return value;
    }

    const result = this.schema.safeParse(value);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        issue: issue.message,
      }));

      const primaryMessage =
        details.length > 0
          ? `${details[0].field}: ${details[0].issue}`
          : 'Validation failed';

      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: primaryMessage,
        details,
      });
    }

    return result.data;
  }
}
