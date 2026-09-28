import axios, { AxiosError } from 'axios';
import { clearSession } from '@/auth/authStorage';
import { AuthError } from '@/auth/types';

/**
 * Resolves the API Base URL for apiClient.
 *
 * In production builds, we strictly route API traffic through the same-origin
 * Cloudflare Pages Functions proxy (/api/v1) unless an explicit relative path is provided.
 * This completely eliminates cross-site third-party cookie blocking issues
 * between pages.dev and onrender.com while keeping session cookies HttpOnly and SameSite=Lax.
 *
 * In non-production environments (development and test), VITE_API_URL can be
 * provided to target a local backend directly, falling back to /api/v1 (proxied via Vite).
 */
export function resolveApiBaseUrl(
  envUrl?: string,
  isProd: boolean = import.meta.env.PROD
): string {
  const trimmed = envUrl?.trim();
  if (isProd) {
    if (trimmed && trimmed.startsWith('/')) {
      return trimmed;
    }
    return '/api/v1';
  }
  return trimmed || '/api/v1';
}

export const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_URL),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
  withCredentials: true,
});

// Response interceptor handling errors and 401 token expirations
apiClient.interceptors.response.use(
  (response) => response,
  (
    error: AxiosError<{
      success?: boolean;
      error?: { code?: string; message?: string; details?: unknown };
    }>
  ) => {
    if (error.response?.status === 401) {
      clearSession();

      // Dispatch global event for auth listener
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('careerforge:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Standardizes API error responses into typed AuthError objects.
 */
export function extractApiError(error: unknown): AuthError {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    const apiErr = error.response.data.error;
    return {
      code: apiErr.code || 'UNKNOWN_ERROR',
      message:
        apiErr.message || 'An unexpected error occurred. Please try again.',
      details: Array.isArray(apiErr.details) ? apiErr.details : undefined,
    };
  }

  if (axios.isAxiosError(error) && !error.response) {
    return {
      code: 'NETWORK_ERROR',
      message:
        'Unable to connect to the server. Please check your internet connection.',
    };
  }

  if (error instanceof Error) {
    return {
      code: 'CLIENT_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred. Please try again.',
  };
}
