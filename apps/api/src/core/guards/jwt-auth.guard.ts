import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TokenService } from '../../modules/auth/token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseCookieHeader } from '../utils/cookie.util';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
    private readonly configService?: ConfigService,
    private readonly prisma?: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      const request = context.switchToHttp().getRequest<Request>();
      const token = this.extractToken(request);
      if (token && typeof this.tokenService?.verifyToken === 'function') {
        try {
          const payload = await this.tokenService.verifyToken(token);
          (request as unknown as { user?: unknown }).user = {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
          };
        } catch {
          // Gracefully ignore invalid or expired tokens on public endpoints
        }
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Missing authorization token',
      });
    }

    const payload = await this.tokenService.verifyToken(token);

    // If database access is available, verify the user exists and has not been banned
    if (this.prisma && typeof this.prisma.user?.findUnique === 'function') {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { is_banned: true },
      });

      if (!user) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message: 'User account no longer exists',
        });
      }

      if (user.is_banned) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Your account has been suspended. Contact support.',
        });
      }
    }

    (request as unknown as { user?: unknown }).user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    return true;
  }

  /**
   * Extracts the JWT from the request.
   *
   * Priority:
   *   1. HttpOnly cookie (primary — browser clients)
   *   2. Authorization: Bearer <token> header (secondary — API clients / test fixtures)
   *
   * Query parameters are explicitly rejected (never read or accepted).
   */
  private extractToken(request: Request): string | undefined {
    const cookieName = this.configService?.authCookieName ?? 'cf_auth';

    // 1. Check req.cookies (populated by cookie-parser middleware)
    const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
    if (cookies && typeof cookies[cookieName] === 'string' && cookies[cookieName]) {
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
