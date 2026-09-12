import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJobById, isValidUuid, listJobs } from './jobsApi';
import {
  JobDetail,
  JobFilterParams,
  JobListItem,
  JobsPaginationMeta,
} from './types';

export const JOBS_QUERY_KEY = ['jobs'] as const;

/**
 * Hook to retrieve active jobs list with filtering and pagination.
 */
export function useJobs(params: JobFilterParams) {
  return useQuery<{ data: JobListItem[]; meta: JobsPaginationMeta }, Error>({
    queryKey: [...JOBS_QUERY_KEY, 'list', params],
    queryFn: () => listJobs(params),
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}

/**
 * Hook to retrieve full job details by ID.
 * Safely guards against missing or invalid UUIDs.
 */
export function useJobDetail(jobId: string | undefined) {
  return useQuery<JobDetail, Error>({
    queryKey: [...JOBS_QUERY_KEY, 'detail', jobId],
    queryFn: () => getJobById(jobId!),
    enabled: Boolean(jobId && isValidUuid(jobId)),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Helper hook to inspect TanStack Query cache for pre-loaded job metadata
 * from earlier job board listings.
 */
export function useCachedJob(
  jobId: string | undefined
): JobListItem | undefined {
  const queryClient = useQueryClient();
  if (!jobId) return undefined;

  const queries = queryClient.getQueriesData<{ data: JobListItem[] }>({
    queryKey: [...JOBS_QUERY_KEY, 'list'],
  });

  for (const [, queryData] of queries) {
    if (queryData?.data && Array.isArray(queryData.data)) {
      const found = queryData.data.find((item) => item.id === jobId);
      if (found) return found;
    }
  }

  return undefined;
}
