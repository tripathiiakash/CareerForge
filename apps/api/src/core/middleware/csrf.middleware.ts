import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '../config/config.service';

/**
 * CsrfMiddleware — lightweight CSRF defense for cookie-authenticated endpoints.
 *
 * Strategy: Origin header validation for state-changing HTTP methods.
 *
 * Rationale:
 * - Cookies configured with SameSite=Lax prevent the browser from sending
 *   cookies on cross-site subrequests (fetch / XHR).
 * - Validating the Origin header adds an explicit second layer of defense.
 * - Cross-origin state-changing requests that do not originate from an
 *   allowed origin are rejected with 403 before any business logic executes.
 *
 * Enforced on: POST, PUT, PATCH, DELETE.
 * Safe methods bypassed: GET, HEAD, OPTIONS.
 *
 * Non-browser / server-to-server requests where the Origin header is absent
 * are permitted, allowing curl, CLI scripts, and backend integrations.
 */
const STATE_CHANGING_METHODS = new Set([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly configService: ConfigService) {
    this.allowedOrigins = new Set(
      configService.corsOrigin
        .split(',')
        .map((o) => o.trim().toLowerCase().replace(/\/$/, ''))
        .filter(Boolean)
    );
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Only enforce on state-changing methods
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      return next();
    }

    let origin = Array.isArray(req.headers.origin)
      ? req.headers.origin[0]
      : req.headers.origin;

    // 2. If Origin is absent, check Referer header as secondary fallback (OWASP CSRF defense)
    if (!origin && typeof req.headers.referer === 'string') {
      try {
        const refUrl = new URL(req.headers.referer);
        origin = refUrl.origin;
      } catch {
        // Malformed referer URL
      }
    }

    // Check if the request carries cookie authentication (cf_auth)
    const hasAuthCookie = Boolean(
      (req.cookies &&
        typeof req.cookies.cf_auth === 'string' &&
        req.cookies.cf_auth.trim().length > 0) ||
      (typeof req.headers?.cookie === 'string' &&
        /(?:^|;\s*)cf_auth=([^;]+)/.test(req.headers.cookie))
    );

    // 3. If neither Origin nor Referer is present:
    // Cookie-authenticated state-changing requests MUST have a valid Origin or Referer.
    // Reject requests with auth cookies that omit both headers (browser CSRF defense).
    // Non-cookie requests (server-to-server, curl, Bearer auth, test clients) are permitted.
    if (!origin || typeof origin !== 'string') {
      if (hasAuthCookie) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message:
              'Cross-origin request rejected: Origin or Referer header required for cookie-authenticated requests',
          },
        });
        return;
      }
      return next();
    }

    const normalizedOrigin = origin.trim().toLowerCase().replace(/\/$/, '');

    // 4. Reject state-changing requests from origins not in the allowlist
    if (!this.allowedOrigins.has(normalizedOrigin)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cross-origin request rejected',
        },
      });
      return;
    }

    next();
  }
}
