import { UserRole } from '@careerforge/types';

export interface DecodedJwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Safely decodes non-sensitive payload claims from a JWT token.
 * Validates expiration (exp) and returns null if expired or malformed.
 */
export function decodeJwt(token: string): DecodedJwtPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const parsed = JSON.parse(jsonPayload);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.email !== 'string'
    ) {
      return null;
    }

    // Check expiration if exp claim exists
    if (typeof parsed.exp === 'number') {
      const expirationMs = parsed.exp * 1000;
      if (expirationMs <= Date.now()) {
        return null; // Token is expired
      }
    }

    return {
      sub: parsed.sub,
      email: parsed.email,
      role: parsed.role as UserRole,
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
