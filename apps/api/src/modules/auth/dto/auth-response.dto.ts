import { UserRole } from '@prisma/client';

export interface AuthResponseData {
  user_id: string;
  email: string;
  role: UserRole;
  token: string;
}

export interface AuthResponseDto {
  success: true;
  data: AuthResponseData;
}
