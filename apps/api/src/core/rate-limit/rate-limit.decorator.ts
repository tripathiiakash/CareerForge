import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { RateLimitOptions } from './rate-limit.types';

export const RATE_LIMIT_KEY = 'RATE_LIMIT_OPTIONS';
export const SKIP_RATE_LIMIT_KEY = 'SKIP_RATE_LIMIT';

/**
 * Decorator to apply route-specific or controller-level rate limiting.
 *
 * @example
 * \@RateLimit({ limit: 10, ttlSeconds: 60, keyPrefix: 'auth', message: 'Too many login attempts.' })
 */
export const RateLimit = (options: RateLimitOptions): CustomDecorator<string> =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Decorator to explicitly bypass rate limiting on a specific endpoint.
 */
export const SkipRateLimit = (): CustomDecorator<string> =>
  SetMetadata(SKIP_RATE_LIMIT_KEY, true);
