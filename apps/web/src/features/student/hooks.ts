import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UpdateStudentProfileInput } from '@careerforge/validation';
import { getStudentProfile, updateStudentProfile } from './studentApi';
import { StudentProfile } from './types';

export const STUDENT_PROFILE_QUERY_KEY = ['student', 'profile'] as const;

/**
 * Hook to retrieve current student's profile.
 */
export function useStudentProfile() {
  return useQuery<StudentProfile, Error>({
    queryKey: STUDENT_PROFILE_QUERY_KEY,
    queryFn: getStudentProfile,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to mutate current student's profile with automatic query cache invalidation.
 */
export function useUpdateStudentProfile() {
  const queryClient = useQueryClient();

  return useMutation<StudentProfile, Error, UpdateStudentProfileInput>({
    mutationFn: updateStudentProfile,
    onSuccess: (updatedProfile) => {
      // Optimistically update query cache and invalidate to ensure freshness
      queryClient.setQueryData(STUDENT_PROFILE_QUERY_KEY, updatedProfile);
      queryClient.invalidateQueries({ queryKey: STUDENT_PROFILE_QUERY_KEY });
    },
  });
}
