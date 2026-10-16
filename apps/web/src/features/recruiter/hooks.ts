import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UpdateRecruiterProfileInput,
  SubmitRecruiterOrganizationInput,
} from '@careerforge/validation';
import {
  getRecruiterProfile,
  updateRecruiterProfile,
  getRecruiterOrganization,
  submitRecruiterOrganization,
  uploadRecruiterEvidence,
} from './recruiterApi';
import { RecruiterProfile, RecruiterVerificationSubmission } from './types';

export const RECRUITER_PROFILE_QUERY_KEY = ['recruiter', 'profile'] as const;
export const RECRUITER_ORGANIZATION_QUERY_KEY = [
  'recruiter',
  'organization',
] as const;

/**
 * Hook to retrieve current recruiter's profile.
 */
export function useRecruiterProfile() {
  return useQuery<RecruiterProfile, Error>({
    queryKey: RECRUITER_PROFILE_QUERY_KEY,
    queryFn: getRecruiterProfile,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to mutate current recruiter's profile with automatic query cache invalidation.
 */
export function useUpdateRecruiterProfile() {
  const queryClient = useQueryClient();

  return useMutation<RecruiterProfile, Error, UpdateRecruiterProfileInput>({
    mutationFn: updateRecruiterProfile,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(RECRUITER_PROFILE_QUERY_KEY, updatedProfile);
      queryClient.invalidateQueries({ queryKey: RECRUITER_PROFILE_QUERY_KEY });
    },
  });
}

/**
 * Hook to retrieve current recruiter's organization verification submission.
 */
export function useRecruiterOrganization() {
  return useQuery<RecruiterVerificationSubmission, Error>({
    queryKey: RECRUITER_ORGANIZATION_QUERY_KEY,
    queryFn: getRecruiterOrganization,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to submit or update recruiter organization details.
 */
export function useSubmitRecruiterOrganization() {
  const queryClient = useQueryClient();

  return useMutation<
    RecruiterVerificationSubmission,
    Error,
    SubmitRecruiterOrganizationInput
  >({
    mutationFn: submitRecruiterOrganization,
    onSuccess: (data) => {
      queryClient.setQueryData(RECRUITER_ORGANIZATION_QUERY_KEY, data);
      queryClient.invalidateQueries({
        queryKey: RECRUITER_ORGANIZATION_QUERY_KEY,
      });
      queryClient.invalidateQueries({ queryKey: RECRUITER_PROFILE_QUERY_KEY });
    },
  });
}

/**
 * Hook to upload verification evidence document.
 */
export function useUploadRecruiterEvidence() {
  const queryClient = useQueryClient();

  return useMutation<RecruiterVerificationSubmission, Error, File>({
    mutationFn: uploadRecruiterEvidence,
    onSuccess: (data) => {
      queryClient.setQueryData(RECRUITER_ORGANIZATION_QUERY_KEY, data);
      queryClient.invalidateQueries({
        queryKey: RECRUITER_ORGANIZATION_QUERY_KEY,
      });
    },
  });
}
