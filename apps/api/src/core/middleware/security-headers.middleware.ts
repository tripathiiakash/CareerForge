import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '../config/config.service';

/**
 * SecurityHeadersMiddleware applies standard defense-in-depth security headers
 * to all incoming requests, protecting against MIME-sniffing, clickjacking,
 * cross-site framing, and unauthorized feature access.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // 1. Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Prevent clickjacking and framing
    res.setHeader('X-Frame-Options', 'DENY');

    // 3. Disable legacy buggy XSS auditor
    res.setHeader('X-XSS-Protection', '0');

    // 4. Control referrer information leakage
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 5. Restrict sensitive browser permissions/features
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );

    // 6. Restrict content execution for API
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );

    // 7. Enforce HSTS (HTTP Strict Transport Security) in production
    if (this.configService.isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    next();
  }
}
