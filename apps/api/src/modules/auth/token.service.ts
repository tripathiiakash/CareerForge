import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { ConfigService } from '../../core/config/config.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Signs a stateless JWT containing { sub, email, role }.
   */
  async signToken(user: {
    id: string;
    email: string;
    role: UserRole;
  }): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.jwtSecret,
      expiresIn: this.configService.jwtExpiresIn as any,
    });
  }

  /**
   * Verifies and decodes a JWT token.
   * Throws UnauthorizedException if the token is invalid or expired.
   */
  async verifyToken(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      });
    }
  }
}
