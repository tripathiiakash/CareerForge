import { apiClient, extractApiError } from '@/lib/api';
import {
  AdminModerationJobStatus,
  ListPendingJobsMeta,
  ListPendingJobsQuery,
  ListPendingJobsResponse,
  ModerateJobStatusData,
  ModerateJobStatusPayload,
  ModerateJobStatusResponse,
  PendingJob,
} from './types';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined | null): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()));
}

/**
 * Builds clean query parameters conforming to docs/API.md §9.1.
 * Omits undefined, non-numeric, or out-of-range values.
 * Backend enforces strict Zod schema: only page and limit (<= 50) are permitted.
 */
export function buildPendingJobsQueryParams(
  params?: ListPendingJobsQuery
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

/**
 * Normalizes query parameters to ensure deterministic representation in React Query cache keys.
 */
export function normalizePendingJobsQueryParams(
  params?: ListPendingJobsQuery
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

/**
 * React Query key factory functions for Admin Job Moderation.
 * Recommended structure: ['admin', 'moderation', 'pending-jobs', params]
 */
export const ADMIN_MODERATION_ROOT_KEY = ['admin', 'moderation'] as const;

export function adminPendingJobsBaseKey() {
  return ['admin', 'moderation', 'pending-jobs'] as const;
}

export function adminPendingJobsQueryKey(params?: ListPendingJobsQuery) {
  const normalized = normalizePendingJobsQueryParams(params);
  return ['admin', 'moderation', 'pending-jobs', normalized] as const;
}

/**
 * Fetches paginated pending jobs awaiting admin approval.
 * Adheres strictly to docs/API.md §9.1.
 * GET /api/v1/admin/jobs/pending
 */
export async function getPendingJobs(params?: ListPendingJobsQuery): Promise<{
  data: PendingJob[];
  meta: ListPendingJobsMeta;
}> {
  const query = buildPendingJobsQueryParams(params);
  const response = await apiClient.get<ListPendingJobsResponse>(
    '/admin/jobs/pending',
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
 * Moderates a pending job status to ACTIVE or REJECTED.
 * Adheres strictly to docs/API.md §9.2.
 * PATCH /api/v1/admin/jobs/:id/status
 */
export async function moderateJobStatus(
  jobId: string,
  status: AdminModerationJobStatus
): Promise<ModerateJobStatusData> {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid jobId format (must be a valid UUID)');
  }

  if (status !== 'ACTIVE' && status !== 'REJECTED') {
    throw new Error("Status must be exactly 'ACTIVE' or 'REJECTED'");
  }

  const payload: ModerateJobStatusPayload = { status };
  const response = await apiClient.patch<ModerateJobStatusResponse>(
    `/admin/jobs/${encodeURIComponent(jobId)}/status`,
    payload
  );

  return response.data.data;
}

export { extractApiError };
