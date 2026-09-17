import { AuthSession, AuthUser } from './types';

export const TOKEN_STORAGE_KEY = 'careerforge_token';
export const USER_STORAGE_KEY = 'careerforge_user';

const isBrowser =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/**
 * Safely reads the authentication token.
 * With SEC-01 HttpOnly cookie migration, JWTs are never stored in browser storage.
 * Always returns null so client code never attempts to read tokens from localStorage.
 */
export function getToken(): string | null {
  return null;
}

/**
 * Deliberately does not store JWT tokens in localStorage (SEC-01).
 * Purges any legacy tokens if present.
 */
export function setToken(_token: string): void {
  removeToken();
}

/**
 * Safely removes any legacy authentication token from localStorage.
 */
export function removeToken(): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

/**
 * Safely reads the serialized user profile from localStorage.
 */
export function getUser(): AuthUser | null {
  if (!isBrowser) return null;
  try {
    const serialized = localStorage.getItem(USER_STORAGE_KEY);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      typeof parsed.email === 'string'
    ) {
      return parsed as AuthUser;
    }
    return null;
  } catch {
    // Malformed JSON: clear invalid value
    removeUser();
    return null;
  }
}

/**
 * Safely stores the serialized user profile in localStorage.
 */
export function setUser(user: AuthUser): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Gracefully handle storage quota errors
  }
}

/**
 * Safely removes the serialized user profile from localStorage.
 */
export function removeUser(): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

/**
 * Persists an authenticated session without storing the JWT token in browser storage.
 */
export function setSession(session: AuthSession): void {
  removeToken();
  setUser(session.user);
}

/**
 * Clears all authentication state from localStorage.
 */
export function clearSession(): void {
  removeToken();
  removeUser();
}
