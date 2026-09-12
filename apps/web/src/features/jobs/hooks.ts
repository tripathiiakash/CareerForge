import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyToJob,
  getJobById,
  getStudentResumes,
  isValidUuid,
  listJobs,
} from './jobsApi';
import {
  ApplicationCreatedData,
  JobDetail,
  JobFilterParams,
  JobListItem,
  JobsPaginationMeta,
  StudentResumeItem,
} from './types';

export const JOBS_QUERY_KEY = ['jobs'] as const;
export const STUDENT_RESUMES_QUERY_KEY = ['student', 'resumes'] as const;

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

/**
 * Hook to retrieve the authenticated student's uploaded resumes.
 */
export function useStudentResumes(enabled: boolean = true) {
  return useQuery<StudentResumeItem[], Error>({
    queryKey: STUDENT_RESUMES_QUERY_KEY,
    queryFn: getStudentResumes,
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Mutation hook to submit a student job application adhering to docs/API.md §8.1.
 * Updates the job detail cache to reflect has_applied: true immediately upon success.
 */
export function useApplyToJob(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<ApplicationCreatedData, Error, { resumeId: string }>({
    mutationFn: ({ resumeId }) => applyToJob(jobId, resumeId),
    onSuccess: () => {
      // 1. Definitively update JobDetail cache so UI updates without waiting for reload
      queryClient.setQueryData<JobDetail>(
        [...JOBS_QUERY_KEY, 'detail', jobId],
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            has_applied: true,
          };
        }
      );

      // 2. Invalidate queries for fresh synchronization
      queryClient.invalidateQueries({
        queryKey: [...JOBS_QUERY_KEY, 'detail', jobId],
      });
      queryClient.invalidateQueries({
        queryKey: ['student', 'applications'],
      });
    },
  });
}
