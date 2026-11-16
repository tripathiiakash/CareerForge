import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { ConfigService } from '../config/config.service';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitStore } from './rate-limit.store';
import { RateLimitOptions } from './rate-limit.types';
import { TokenService } from '../../modules/auth/token.service';
import { parseCookieHeader } from '../utils/cookie.util';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly store: RateLimitStore,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @Optional() private readonly tokenService?: TokenService
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
    let userId = (request as unknown as { user?: { userId?: string } }).user
      ?.userId;

    // If user is not yet populated on the request (e.g. RateLimitGuard executing as APP_GUARD
    // prior to controller-scoped JwtAuthGuard), attempt to extract and verify the auth token
    if (!userId && this.tokenService) {
      const token = this.extractToken(request);
      if (token) {
        try {
          const payload = await this.tokenService.verifyToken(token);
          if (payload?.sub) {
            userId = payload.sub;
            (request as unknown as { user?: unknown }).user = {
              userId: payload.sub,
              email: payload.email,
              role: payload.role,
            };
          }
        } catch {
          // Gracefully ignore invalid or expired tokens in rate limiter;
          // falls back to IP-based rate limiting, and downstream auth guard enforces 401.
        }
      }
    }

    // Use user ID if authenticated, otherwise use client IP
    const identifier = userId ? `user:${userId}` : `ip:${clientIp}`;
    const rateLimitKey = `${prefix}:${identifier}`;

    // 5. Increment counter
    const result = await this.store.increment(rateLimitKey, limit, ttlSeconds);

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
   * Resolves client IP address:
   * 1. If an authenticated proxy secret is configured on the server AND the incoming
   *    request includes a matching proxy secret header (verified using constant-time comparison)
   *    AND the visitor-IP header is syntactically valid (isIP !== 0):
   *    returns the normalized authenticated visitor IP.
   * 2. In all other cases (missing/invalid secret, invalid IP syntax, direct unauthenticated requests):
   *    falls back to Express trusted reverse-proxy resolution (req.ip), socket remoteAddress,
   *    or 127.0.0.1.
   *
   * Arbitrary client-supplied headers (X-Forwarded-For, x-cf-visitor-ip) are strictly ignored
   * unless authenticated by the shared secret.
   */
  private getClientIp(request: Request): string {
    const configuredSecret = this.configService?.proxySharedSecret;

    if (configuredSecret) {
      const incomingSecret =
        (request.headers?.[PROXY_AUTH_HEADER] as string | undefined) ||
        (request.headers?.['x-proxy-secret'] as string | undefined);

      if (safeCompareSecret(incomingSecret, configuredSecret)) {
        const rawVisitorIp =
          (request.headers?.[PROXY_VISITOR_IP_HEADER] as string | undefined) ||
          (request.headers?.['x-visitor-ip'] as string | undefined);

        if (rawVisitorIp && typeof rawVisitorIp === 'string') {
          const trimmed = rawVisitorIp.trim();
          if (isValidIp(trimmed)) {
            return normalizeIp(trimmed);
          }
        }
      }
    }

    const rawIp = request.ip || request.socket?.remoteAddress || '127.0.0.1';
    return normalizeIp(rawIp);
  }

  /**
   * Extracts the JWT from the request using the same precedence as JwtAuthGuard:
   * 1. HttpOnly cookie (primary — browser clients)
   * 2. Authorization: Bearer <token> header (secondary — API clients / test fixtures)
   */
  private extractToken(request: Request): string | undefined {
    const cookieName = this.configService?.authCookieName ?? 'cf_auth';

    // 1. Check req.cookies (populated by cookie-parser middleware)
    const cookies = (request as unknown as { cookies?: Record<string, string> })
      .cookies;
    if (
      cookies &&
      typeof cookies[cookieName] === 'string' &&
      cookies[cookieName]
    ) {
      return cookies[cookieName];
    }

    // 1b. Fallback: Parse raw Cookie header if cookie-parser middleware was not run
    if (request.headers?.cookie) {
      const parsed = parseCookieHeader(request.headers.cookie);
      if (parsed[cookieName]) {
        return parsed[cookieName];
      }
    }

    // 2. Check Authorization: Bearer <token> header (API clients / tests)
    const authHeader = request.headers?.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    return undefined;
  }
}

export const PROXY_AUTH_HEADER = 'x-cf-proxy-secret';
export const PROXY_VISITOR_IP_HEADER = 'x-cf-visitor-ip';

/**
 * Constant-time string comparison preventing timing side-channel attacks.
 */
export function safeCompareSecret(
  provided?: string | null,
  expected?: string | null
): boolean {
  if (
    !provided ||
    !expected ||
    typeof provided !== 'string' ||
    typeof expected !== 'string'
  ) {
    return false;
  }
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates whether a given string is a syntactically valid IPv4 or IPv6 address.
 */
export function isValidIp(ip?: string | null): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  const trimmed = ip.trim();
  return isIP(trimmed) !== 0;
}

/**
 * Normalizes an IP address by trimming whitespace, stripping IPv4-mapped IPv6
 * prefixes (::ffff:), and mapping IPv6 loopback (::1) to 127.0.0.1.
 */
export function normalizeIp(rawIp?: string | null): string {
  if (!rawIp || typeof rawIp !== 'string') {
    return '127.0.0.1';
  }
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip || '127.0.0.1';
}
