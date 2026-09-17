import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { ConfigService } from '../config/config.service';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitStore } from './rate-limit.store';
import { RateLimitOptions } from './rate-limit.types';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly store: RateLimitStore,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. If rate limiting is globally disabled (e.g. in specific test harness), bypass
    if (!this.configService.rateLimitEnabled) {
      return true;
    }

    // 2. Check for @SkipRateLimit() override
    const isSkipped = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (isSkipped) {
      return true;
    }

    // 3. Resolve rate limit metadata or fallback to global defaults
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    );

    const limit = options?.limit ?? this.configService.rateLimitGlobalMax;
    const ttlSeconds =
      options?.ttlSeconds ?? this.configService.rateLimitWindowSeconds;
    const prefix = options?.keyPrefix ?? 'global';
    const message =
      options?.message ?? 'Too many requests. Please try again later.';

    // 4. Resolve client identity
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const clientIp = this.getClientIp(request);
    const user = (request as unknown as { user?: { userId?: string } }).user;

    // Use user ID if authenticated, otherwise use client IP
    const identifier = user?.userId ? `user:${user.userId}` : `ip:${clientIp}`;
    const rateLimitKey = `${prefix}:${identifier}`;

    // 5. Increment counter
    const result = this.store.increment(rateLimitKey, limit, ttlSeconds);

    // 6. Set standard X-RateLimit headers
    if (response && typeof response.setHeader === 'function') {
      response.setHeader('X-RateLimit-Limit', limit);
      response.setHeader('X-RateLimit-Remaining', result.remaining);
      response.setHeader('X-RateLimit-Reset', result.resetAt);
    }

    // 7. If limit exceeded, set Retry-After and throw HTTP 429
    if (result.isBlocked) {
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('Retry-After', result.retryAfterSeconds);
      }

      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message,
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }

  /**
   * Resolves client IP address through Express trusted reverse proxy configuration,
   * falling back to the direct socket address or localhost fallback.
   * Arbitrary client-supplied X-Forwarded-For headers are never blindly parsed.
   */
  private getClientIp(request: Request): string {
    return request.ip || request.socket?.remoteAddress || '127.0.0.1';
  }
}
