import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminPendingJobsBaseKey,
  adminPendingJobsQueryKey,
  getPendingJobs,
  moderateJobStatus,
} from './adminModerationApi';
import {
  AdminModerationJobStatus,
  ListPendingJobsMeta,
  ListPendingJobsQuery,
  ModerateJobStatusData,
  PendingJob,
} from './types';

export interface ModerateJobStatusVariables {
  jobId: string;
  status: AdminModerationJobStatus;
}

/**
 * Hook to retrieve paginated pending jobs awaiting admin moderation.
 * Adheres strictly to docs/API.md §9.1.
 */
export function usePendingJobs(params?: ListPendingJobsQuery) {
  return useQuery<{ data: PendingJob[]; meta: ListPendingJobsMeta }, Error>({
    queryKey: adminPendingJobsQueryKey(params),
    queryFn: () => getPendingJobs(params),
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
    retry: 1,
  });
}

/**
 * Hook to moderate a pending job's status (ACTIVE or REJECTED).
 * Adheres strictly to docs/API.md §9.2.
 * Server is authoritative for state machine transitions.
 * On success, invalidates all pending job list queries.
 */
export function useModerateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation<ModerateJobStatusData, Error, ModerateJobStatusVariables>({
    mutationFn: ({ jobId, status }) => moderateJobStatus(jobId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminPendingJobsBaseKey(),
      });
    },
  });
}
