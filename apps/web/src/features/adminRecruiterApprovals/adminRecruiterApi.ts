import { apiClient, extractApiError } from '@/lib/api';
import {
  ListPendingRecruitersMeta,
  ListPendingRecruitersQuery,
  ListPendingRecruitersResponse,
  ModerateRecruiterData,
  ModerateRecruiterResponse,
  PendingRecruiter,
} from './types';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined | null): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()));
}

export function buildPendingRecruitersQueryParams(
  params?: ListPendingRecruitersQuery
): Record<string, number> {
  const query: Record<string, number> = {};

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

  return query;
}

export function normalizePendingRecruitersQueryParams(
  params?: ListPendingRecruitersQuery
): {
  page: number;
  limit: number;
} {
  return {
    page: params?.page && params.page > 0 ? Math.floor(params.page) : 1,
    limit:
      params?.limit && params.limit > 0 && params.limit <= 50
        ? Math.floor(params.limit)
        : 10,
  };
}

export const ADMIN_RECRUITER_APPROVALS_ROOT_KEY = [
  'admin',
  'recruiters',
] as const;

export function adminPendingRecruitersBaseKey() {
  return ['admin', 'recruiters', 'pending'] as const;
}

export function adminPendingRecruitersQueryKey(
  params?: ListPendingRecruitersQuery
) {
  const normalized = normalizePendingRecruitersQueryParams(params);
  return ['admin', 'recruiters', 'pending', normalized] as const;
}

/**
 * Fetches paginated pending recruiters awaiting admin verification.
 * GET /api/v1/admin/recruiters/pending
 */
export async function getPendingRecruiters(
  params?: ListPendingRecruitersQuery
): Promise<{
  data: PendingRecruiter[];
  meta: ListPendingRecruitersMeta;
}> {
  const query = buildPendingRecruitersQueryParams(params);
  const response = await apiClient.get<ListPendingRecruitersResponse>(
    '/admin/recruiters/pending',
    {
      params: Object.keys(query).length > 0 ? query : undefined,
    }
  );

  return {
    data: response.data.data,
    meta: response.data.meta,
  };
}

/**
 * Approves a recruiter account.
 * PATCH /api/v1/admin/recruiters/:id/approve
 */
export async function approveRecruiter(
  recruiterId: string
): Promise<ModerateRecruiterData> {
  if (!isValidUuid(recruiterId)) {
    throw new Error('Invalid recruiterId format (must be a valid UUID)');
  }

  const response = await apiClient.patch<ModerateRecruiterResponse>(
    `/admin/recruiters/${encodeURIComponent(recruiterId)}/approve`
  );

  return response.data.data;
}

/**
 * Rejects or disables a recruiter account.
 * PATCH /api/v1/admin/recruiters/:id/reject
 */
export async function rejectRecruiter(
  recruiterId: string
): Promise<ModerateRecruiterData> {
  if (!isValidUuid(recruiterId)) {
    throw new Error('Invalid recruiterId format (must be a valid UUID)');
  }

  const response = await apiClient.patch<ModerateRecruiterResponse>(
    `/admin/recruiters/${encodeURIComponent(recruiterId)}/reject`
  );

  return response.data.data;
}

export { extractApiError };
