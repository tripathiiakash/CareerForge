/**
 * Shared Domain & API Types for CareerForge
 * Note: Domain models will be introduced during respective module implementations.
 */

/**
 * Standard API response envelope as finalized in docs/API.md
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorEnvelope;
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard paginated list data envelope
 */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * User roles defined across the system
 */
export type UserRole = 'STUDENT' | 'RECRUITER' | 'ADMIN';
