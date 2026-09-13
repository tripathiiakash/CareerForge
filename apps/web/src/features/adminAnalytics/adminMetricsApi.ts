import { apiClient, extractApiError } from '@/lib/api';
import { AdminMetricsResponse, PlatformMetricsData } from './types';

/**
 * React Query key factory functions for Admin Platform Analytics & Metrics.
 * Stable structure: ['admin', 'metrics']
 */
export const ADMIN_METRICS_ROOT_KEY = ['admin', 'metrics'] as const;

export function adminMetricsBaseKey() {
  return ['admin', 'metrics'] as const;
}

export function adminMetricsQueryKey() {
  return ['admin', 'metrics'] as const;
}

/**
 * Fetches high-level platform counters for the admin dashboard overview.
 * Adheres strictly to docs/API.md §9.5.
 * GET /api/v1/admin/metrics
 */
export async function getAdminMetrics(): Promise<PlatformMetricsData> {
  const response = await apiClient.get<AdminMetricsResponse>('/admin/metrics');

  const raw = response.data?.data;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid response format: missing data payload');
  }

  return {
    total_students:
      typeof raw.total_students === 'number' &&
      !Number.isNaN(raw.total_students)
        ? raw.total_students
        : 0,
    total_recruiters:
      typeof raw.total_recruiters === 'number' &&
      !Number.isNaN(raw.total_recruiters)
        ? raw.total_recruiters
        : 0,
    active_jobs:
      typeof raw.active_jobs === 'number' && !Number.isNaN(raw.active_jobs)
        ? raw.active_jobs
        : 0,
    pending_jobs:
      typeof raw.pending_jobs === 'number' && !Number.isNaN(raw.pending_jobs)
        ? raw.pending_jobs
        : 0,
    total_applications:
      typeof raw.total_applications === 'number' &&
      !Number.isNaN(raw.total_applications)
        ? raw.total_applications
        : 0,
  };
}

export { extractApiError };
