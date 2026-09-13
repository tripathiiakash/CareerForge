import { apiClient, extractApiError } from '@/lib/api';
import {
  ApplicantStatus,
  JobApplicant,
  ListJobApplicantsMeta,
  ListJobApplicantsQuery,
  ListJobApplicantsResponse,
  UpdateApplicationStatusData,
  UpdateApplicationStatusPayload,
  UpdateApplicationStatusResponse,
} from './types';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined | null): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()));
}

/**
 * Builds clean query parameters conforming to docs/API.md §8.2.
 * Omits undefined, empty, or unselected values.
 * Backend uses .strict() zod schema: only page, limit, and status are permitted.
 */
export function buildJobApplicantsQueryParams(
  params?: ListJobApplicantsQuery
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

  if (
    params.status &&
    ['APPLIED', 'SHORTLISTED', 'REJECTED'].includes(params.status)
  ) {
    query.status = params.status;
  }

  return query;
}

/**
 * Normalizes applicant query parameters to ensure deterministic representation in React Query cache keys.
 */
export function normalizeApplicantQueryParams(
  params?: ListJobApplicantsQuery
): {
  page: number;
  limit: number;
  status?: ApplicantStatus;
} {
  return {
    page: params?.page && params.page > 0 ? Math.floor(params.page) : 1,
    limit:
      params?.limit && params.limit > 0 && params.limit <= 50
        ? Math.floor(params.limit)
        : 10,
    ...(params?.status &&
    ['APPLIED', 'SHORTLISTED', 'REJECTED'].includes(params.status)
      ? { status: params.status }
      : {}),
  };
}

/**
 * React Query key factory functions for recruiter applicants.
 * Recommended structure: ['recruiter', 'jobs', jobId, 'applicants', params]
 */
export const RECRUITER_APPLICANTS_ROOT_KEY = ['recruiter', 'jobs'] as const;

export function recruiterJobApplicantsBaseKey(jobId: string) {
  return ['recruiter', 'jobs', jobId, 'applicants'] as const;
}

export function recruiterApplicantsQueryKey(
  jobId: string,
  params?: ListJobApplicantsQuery
) {
  const normalized = normalizeApplicantQueryParams(params);
  return ['recruiter', 'jobs', jobId, 'applicants', normalized] as const;
}

/**
 * Fetches paginated applicants for a job owned by the authenticated recruiter.
 * Adheres strictly to docs/API.md §8.2.
 * GET /api/v1/jobs/:jobId/applicants
 */
export async function getJobApplicants(
  jobId: string,
  params?: ListJobApplicantsQuery
): Promise<{
  data: JobApplicant[];
  meta: ListJobApplicantsMeta;
}> {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid jobId format (must be a valid UUID)');
  }

  const query = buildJobApplicantsQueryParams(params);
  const response = await apiClient.get<ListJobApplicantsResponse>(
    `/jobs/${encodeURIComponent(jobId)}/applicants`,
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
 * Updates application status to SHORTLISTED or REJECTED.
 * Adheres strictly to docs/API.md §8.3.
 * PATCH /api/v1/applications/:id/status
 */
export async function updateApplicationStatus(
  applicationId: string,
  status: 'SHORTLISTED' | 'REJECTED'
): Promise<UpdateApplicationStatusData> {
  if (!isValidUuid(applicationId)) {
    throw new Error('Invalid applicationId format (must be a valid UUID)');
  }

  if (status !== 'SHORTLISTED' && status !== 'REJECTED') {
    throw new Error("Status must be exactly 'SHORTLISTED' or 'REJECTED'");
  }

  const payload: UpdateApplicationStatusPayload = { status };
  const response = await apiClient.patch<UpdateApplicationStatusResponse>(
    `/applications/${encodeURIComponent(applicationId)}/status`,
    payload
  );

  return response.data.data;
}

export { extractApiError };
