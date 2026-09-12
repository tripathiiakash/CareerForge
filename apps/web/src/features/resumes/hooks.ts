import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getStudentResumes, uploadStudentResume } from './resumesApi';
import { StudentResumeItem, UploadResumeData } from './types';

export const RESUMES_QUERY_KEY = ['student', 'resumes'] as const;

/**
 * Hook to retrieve all uploaded resumes for the current authenticated student.
 */
export function useStudentResumes(enabled: boolean = true) {
  return useQuery<StudentResumeItem[], Error>({
    queryKey: RESUMES_QUERY_KEY,
    queryFn: getStudentResumes,
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * Hook to upload a new resume PDF.
 * Invalidates the resumes cache on success so all dependent components update.
 */
export function useUploadResume() {
  const queryClient = useQueryClient();

  return useMutation<
    UploadResumeData,
    Error,
    { file: File; onProgress?: (percent: number) => void }
  >({
    mutationFn: ({ file, onProgress }) => uploadStudentResume(file, onProgress),
    onSuccess: () => {
      // Invalidate student resumes query cache to immediately refresh resume lists
      queryClient.invalidateQueries({
        queryKey: RESUMES_QUERY_KEY,
      });
    },
  });
}
