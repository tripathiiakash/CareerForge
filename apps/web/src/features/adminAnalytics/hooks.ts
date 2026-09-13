import { useQuery } from '@tanstack/react-query';
import { adminMetricsQueryKey, getAdminMetrics } from './adminMetricsApi';
import { PlatformMetricsData } from './types';

/**
 * Hook to retrieve platform metrics overview for administrators.
 * Adheres strictly to docs/API.md §9.5.
 *
 * Configured with 30s staleTime and 1 retry conforming to existing
 * CareerForge admin query conventions (useAdminUsers, usePendingJobs).
 */
export function useAdminMetrics() {
  return useQuery<PlatformMetricsData, Error>({
    queryKey: adminMetricsQueryKey(),
    queryFn: getAdminMetrics,
    staleTime: 30 * 1000,
    retry: 1,
  });
}
