import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateJobInput, UpdateJobInput } from '@careerforge/validation';
import {
  createJob,
  deleteJob,
  getJobDetail,
  getRecruiterJobs,
  updateJob,
} from './recruiterJobsApi';
import { JobCreatedData, JobUpdatedData, RecruiterJobItem } from './types';
import { JobDetail } from '@/features/jobs/types';

export const RECRUITER_JOBS_QUERY_KEY = ['recruiter', 'jobs'] as const;
export const recruiterJobQueryKey = (jobId: string) =>
  ['recruiter', 'job', jobId] as const;

/**
 * Hook to retrieve all jobs managed by the authenticated recruiter directly from the server.
 */
export function useRecruiterJobs() {
  return useQuery<RecruiterJobItem[], Error>({
    queryKey: RECRUITER_JOBS_QUERY_KEY,
    queryFn: () => getRecruiterJobs(),
    staleTime: 30 * 1000,
  });
}

/**
 * Hook to retrieve details for a specific job.
 */
export function useJobDetail(jobId: string) {
  return useQuery<JobDetail, Error>({
    queryKey: recruiterJobQueryKey(jobId),
    queryFn: () => getJobDetail(jobId),
    enabled: Boolean(jobId),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to create a new job posting.
 */
export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation<JobCreatedData, Error, CreateJobInput>({
    mutationFn: createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: RECRUITER_JOBS_QUERY_KEY,
      });
    },
  });
}

/**
 * Hook to partially update an existing job posting.
 */
export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation<
    JobUpdatedData,
    Error,
    { jobId: string; dto: UpdateJobInput }
  >({
    mutationFn: ({ jobId, dto }) => updateJob(jobId, dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: recruiterJobQueryKey(variables.jobId),
      });
      queryClient.invalidateQueries({
        queryKey: RECRUITER_JOBS_QUERY_KEY,
      });
    },
  });
}

/**
 * Hook to delete an existing job posting.
 */
export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, string>({
    mutationFn: deleteJob,
    onSuccess: (_, jobId) => {
      queryClient.removeQueries({
        queryKey: recruiterJobQueryKey(jobId),
      });
      queryClient.invalidateQueries({
        queryKey: RECRUITER_JOBS_QUERY_KEY,
      });
    },
  });
}
