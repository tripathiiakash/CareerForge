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
 * Accurately extracts messages from standard API envelopes, NestJS/Express formats,
 * HTTP status fallbacks (401, 403, 409, 429, 500, 502/503/504), network timeouts,
 * and proxy HTML/plaintext error responses without ever displaying raw Axios technical strings.
 */
export function extractApiError(error: unknown): AuthError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;

    // 1. Structured API error envelope: { success: false, error: { code, message, details } }
    if (data && typeof data === 'object' && 'error' in data) {
      const apiErr = (data as { error?: unknown }).error;
      if (apiErr && typeof apiErr === 'object') {
        const code =
          (apiErr as { code?: string }).code || mapHttpStatusToCode(status);
        const message =
          (apiErr as { message?: string }).message ||
          mapHttpStatusToMessage(status);
        const rawDetails = (apiErr as { details?: unknown }).details;
        const details = Array.isArray(rawDetails)
          ? (rawDetails as Array<{ field?: string; issue?: string }>)
          : undefined;

        return { code, message, details };
      }

      // Handle NestJS validation array when error is status text: { statusCode: 400, message: [...], error: 'Bad Request' }
      if (
        'message' in data &&
        Array.isArray((data as { message?: unknown }).message) &&
        (data as { message: unknown[] }).message.length > 0
      ) {
        const rawMessage = (data as { message: unknown[] }).message;
        const first = rawMessage[0];
        return {
          code: mapHttpStatusToCode(status),
          message: typeof first === 'string' ? first : 'Validation failed',
          details: rawMessage.map((m) => ({
            issue: typeof m === 'string' ? m : String(m),
          })),
        };
      }

      // If .error is a string (e.g. { error: "Too Many Requests" })
      if (typeof apiErr === 'string' && apiErr.trim().length > 0) {
        return {
          code: mapHttpStatusToCode(status),
          message: apiErr.trim(),
        };
      }
    }

    // 2. Standard NestJS / Express error format: { statusCode, message: string | string[], error?: string }
    if (data && typeof data === 'object' && 'message' in data) {
      const rawMessage = (data as { message?: unknown }).message;
      if (typeof rawMessage === 'string' && rawMessage.trim().length > 0) {
        return {
          code: mapHttpStatusToCode(status),
          message: rawMessage.trim(),
        };
      }
      if (Array.isArray(rawMessage) && rawMessage.length > 0) {
        const first = rawMessage[0];
        return {
          code: mapHttpStatusToCode(status),
          message: typeof first === 'string' ? first : 'Validation failed',
          details: rawMessage.map((m) => ({
            issue: typeof m === 'string' ? m : String(m),
          })),
        };
      }
    }

    // 3. Response was received, but body was HTML, plain text, or empty (e.g. 502 no-deploy, 429, 504)
    if (status) {
      return {
        code: mapHttpStatusToCode(status),
        message: mapHttpStatusToMessage(status),
      };
    }

    // 4. Request was made but no response received (timeout, abort, network loss)
    if (!error.response) {
      if (
        error.code === 'ECONNABORTED' ||
        error.message?.toLowerCase().includes('timeout')
      ) {
        return {
          code: 'TIMEOUT_ERROR',
          message:
            'The request timed out. The server may be restarting or taking longer than usual. Please try again.',
        };
      }

      return {
        code: 'NETWORK_ERROR',
        message:
          'Unable to connect to the server. Please check your internet connection or try again later.',
      };
    }
  }

  // 5. Generic Error instance (not Axios or unrecognized)
  if (error instanceof Error) {
    // If an error message looks like "Request failed with status code XYZ", sanitize it
    const statusMatch = error.message.match(/status code (\d{3})/);
    if (statusMatch) {
      const statusNum = parseInt(statusMatch[1], 10);
      return {
        code: mapHttpStatusToCode(statusNum),
        message: mapHttpStatusToMessage(statusNum),
      };
    }

    return {
      code: 'CLIENT_ERROR',
      message:
        error.message || 'An unexpected error occurred. Please try again.',
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred. Please try again.',
  };
}
