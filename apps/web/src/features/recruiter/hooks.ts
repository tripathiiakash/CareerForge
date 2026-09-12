import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UpdateRecruiterProfileInput } from '@careerforge/validation';
import { getRecruiterProfile, updateRecruiterProfile } from './recruiterApi';
import { RecruiterProfile } from './types';

export const RECRUITER_PROFILE_QUERY_KEY = ['recruiter', 'profile'] as const;

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
