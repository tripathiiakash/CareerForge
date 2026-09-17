import { UserRole } from '@prisma/client';

/**
 * Internal full auth result (includes token for cookie-setting in controller).
 * Never serialized directly to the HTTP response body.
 */
export interface AuthInternalResult {
  user_id: string;
  email: string;
  role: UserRole;
  token: string;
}

/**
 * Public auth response data returned in the JSON body.
 * The JWT is deliberately absent — it is conveyed via the HttpOnly cookie.
 */
export interface AuthPublicResponseData {
  user_id: string;
  email: string;
  role: UserRole;
}

/**
 * @deprecated Use AuthInternalResult internally; controller maps to AuthPublicResponseData.
 * Kept for backward compatibility with existing test mocks that reference AuthResponseData.
 */
export type AuthResponseData = AuthInternalResult;

export interface AuthResponseDto {
  success: true;
  data: AuthPublicResponseData;
}
