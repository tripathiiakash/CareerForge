import { UserRole } from '@prisma/client';

export interface JwtPayload {
  readonly sub: string;
  readonly email: string;
  readonly role: UserRole;
  readonly iat?: number;
  readonly exp?: number;
}
