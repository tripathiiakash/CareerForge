import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getJobApplicants,
  isValidUuid,
  recruiterApplicantsQueryKey,
  recruiterJobApplicantsBaseKey,
  updateApplicationStatus,
} from './recruiterApplicantsApi';
import {
  JobApplicant,
  ListJobApplicantsMeta,
  ListJobApplicantsQuery,
  UpdateApplicationStatusData,
} from './types';

export interface UpdateApplicationStatusVariables {
  applicationId: string;
  status: 'SHORTLISTED' | 'REJECTED';
}

/**
 * Hook to retrieve paginated applicants for a job owned by the authenticated recruiter.
 * Adheres strictly to docs/API.md §8.2.
 */
export function useJobApplicants(
  jobId: string,
  params?: ListJobApplicantsQuery
) {
  return useQuery<{ data: JobApplicant[]; meta: ListJobApplicantsMeta }, Error>(
    {
      queryKey: recruiterApplicantsQueryKey(jobId, params),
      queryFn: () => getJobApplicants(jobId, params),
      enabled: Boolean(jobId && isValidUuid(jobId)),
      staleTime: 30 * 1000,
      placeholderData: (previousData) => previousData,
      retry: 1,
    }
  );
}

/**
 * Hook to update application status to SHORTLISTED or REJECTED.
 * Adheres strictly to docs/API.md §8.3.
 * Server is authoritative for state machine transitions.
 * On success, invalidates all applicant list queries for the job.
 */
export function useUpdateApplicationStatus(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    UpdateApplicationStatusData,
    Error,
    UpdateApplicationStatusVariables
  >({
    mutationFn: ({ applicationId, status }) =>
      updateApplicationStatus(applicationId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: recruiterJobApplicantsBaseKey(jobId),
      });
    },
  });
}
