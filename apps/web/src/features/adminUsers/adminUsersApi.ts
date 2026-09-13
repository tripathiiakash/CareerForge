import { apiClient, extractApiError } from '@/lib/api';
import {
  AdminUser,
  AdminUserFilterRole,
  DeleteAdminUserResponse,
  ListAdminUsersMeta,
  ListAdminUsersQuery,
  ListAdminUsersResponse,
} from './types';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined | null): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()));
}

/**
 * Builds clean query parameters conforming to docs/API.md §9.3.
 * Omits undefined, non-numeric, or out-of-range values.
 * Backend enforces strict Zod schema: page (>= 1), limit (1..50), role (STUDENT | RECRUITER), search (trimmed).
 */
export function buildAdminUsersQueryParams(
  params?: ListAdminUsersQuery
): Record<string, string | number> {
  const query: Record<string, string | number> = {};

  if (!params) return query;

  if (typeof params.page === 'number' && params.page > 0) {
    query.page = Math.floor(params.page);
  }

  if (
    typeof params.limit === 'number' &&
    params.limit > 0 &&
    params.limit <= 50
  ) {
    query.limit = Math.floor(params.limit);
  }

  if (params.role === 'STUDENT' || params.role === 'RECRUITER') {
    query.role = params.role;
  }

  if (typeof params.search === 'string') {
    const trimmed = params.search.trim();
    if (trimmed.length > 0) {
      query.search = trimmed;
    }
  }

  return query;
}

/**
 * Normalizes query parameters to ensure deterministic representation in React Query cache keys.
 * Normalizes defaults so undefined, {}, and { page: 1, limit: 20 } produce identical keys.
 */
export function normalizeAdminUsersQueryParams(params?: ListAdminUsersQuery): {
  page: number;
  limit: number;
  role?: AdminUserFilterRole;
  search?: string;
} {
  const page = params?.page && params.page > 0 ? Math.floor(params.page) : 1;
  const limit =
    params?.limit && params.limit > 0 && params.limit <= 50
      ? Math.floor(params.limit)
      : 20;

  const role =
    params?.role === 'STUDENT' || params?.role === 'RECRUITER'
      ? params.role
      : undefined;

  const trimmedSearch =
    typeof params?.search === 'string' ? params.search.trim() : '';

  return {
    page,
    limit,
    ...(role ? { role } : {}),
    ...(trimmedSearch.length > 0 ? { search: trimmedSearch } : {}),
  };
}

/**
 * React Query key factory functions for Admin User Management.
 * Stable structure: ['admin', 'users', normalizedParams]
 */
export const ADMIN_USERS_ROOT_KEY = ['admin', 'users'] as const;

export function adminUsersBaseKey() {
  return ['admin', 'users'] as const;
}

export function adminUsersQueryKey(params?: ListAdminUsersQuery) {
  const normalized = normalizeAdminUsersQueryParams(params);
  return ['admin', 'users', normalized] as const;
}

/**
 * Fetches paginated platform users for administrative moderation.
 * Adheres strictly to docs/API.md §9.3.
 * GET /api/v1/admin/users
 */
export async function getAdminUsers(params?: ListAdminUsersQuery): Promise<{
  data: AdminUser[];
  meta: ListAdminUsersMeta;
}> {
  const query = buildAdminUsersQueryParams(params);
  const response = await apiClient.get<ListAdminUsersResponse>('/admin/users', {
    params: Object.keys(query).length > 0 ? query : undefined,
  });

  return {
    data: response.data.data,
    meta: response.data.meta,
  };
}

/**
 * Deletes a platform user and their associated data.
 * Adheres strictly to docs/API.md §9.4.
 * DELETE /api/v1/admin/users/:id
 * Client validates UUID before dispatching; backend remains authoritative for self-delete and authorization checks.
 */
export async function deleteAdminUser(
  userId: string
): Promise<DeleteAdminUserResponse> {
  if (!isValidUuid(userId)) {
    throw new Error('Invalid userId format (must be a valid UUID)');
  }

  const response = await apiClient.delete<DeleteAdminUserResponse>(
    `/admin/users/${encodeURIComponent(userId)}`
  );

  return response.data;
}

export { extractApiError };
