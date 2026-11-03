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
 * Maps standard HTTP status codes to standardized CareerForge error codes.
 */
export function mapHttpStatusToCode(status?: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    case 500:
      return 'INTERNAL_ERROR';
    case 502:
    case 503:
      return 'SERVICE_UNAVAILABLE';
    case 504:
      return 'GATEWAY_TIMEOUT';
    default:
      return status ? `HTTP_${status}` : 'UNKNOWN_ERROR';
  }
}

/**
 * Maps standard HTTP status codes to user-friendly messages, preventing raw infrastructure leaks.
 */
export function mapHttpStatusToMessage(status?: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your submission.';
    case 401:
      return 'Invalid credentials';
    case 403:
      return 'Access denied. Your account does not have permission or has been suspended.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This email address is already registered. Please sign in instead.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    case 500:
      return 'An unexpected server error occurred. Please try again later.';
    case 502:
    case 503:
      return 'The server is temporarily unavailable or restarting. Please try again in a moment.';
    case 504:
      return 'The server took too long to respond. Please try again in a moment.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

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
