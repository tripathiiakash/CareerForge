/**
 * Configuration options for the @RateLimit() decorator.
 */
export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed within the window.
   */
  limit: number;

  /**
   * Time window in seconds. Defaults to 60 seconds if unspecified.
   */
  ttlSeconds?: number;

  /**
   * Namespace/key prefix for this route category (e.g., 'auth', 'ai', 'jobs').
   */
  keyPrefix?: string;

  /**
   * Custom message returned in the error payload when rate limit is exceeded.
   */
  message?: string;
}

/**
 * Result returned by RateLimitStore on increment.
 */
export interface RateLimitResult {
  totalHits: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  isBlocked: boolean;
  retryAfterSeconds: number;
}
