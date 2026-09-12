import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { clearSession, getToken } from '@/auth/authStorage';
import { AuthError } from '@/auth/types';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Automatic JWT request interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

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
