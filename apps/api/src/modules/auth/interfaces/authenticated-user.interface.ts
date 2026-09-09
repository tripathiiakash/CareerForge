import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
}
