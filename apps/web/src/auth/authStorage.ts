import { AuthSession, AuthUser } from './types';

export const TOKEN_STORAGE_KEY = 'careerforge_token';
export const USER_STORAGE_KEY = 'careerforge_user';

const isBrowser =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/**
 * Safely reads the authentication token from localStorage.
 */
export function getToken(): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Safely stores the authentication token in localStorage.
 */
export function setToken(token: string): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Gracefully handle storage quota or privacy mode errors
  }
}

/**
 * Safely removes the authentication token from localStorage.
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
 * Persists an authenticated session atomically.
 */
export function setSession(session: AuthSession): void {
  setToken(session.token);
  setUser(session.user);
}

/**
 * Clears all authentication state from localStorage.
 */
export function clearSession(): void {
  removeToken();
  removeUser();
}
