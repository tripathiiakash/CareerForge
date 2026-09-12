import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getResumeAnalysis,
  getStudentResumes,
  triggerResumeAnalysis,
  uploadStudentResume,
} from './resumesApi';
import {
  GetAnalysisData,
  StudentResumeItem,
  TriggerAnalysisData,
  UploadResumeData,
} from './types';

export const RESUMES_QUERY_KEY = ['student', 'resumes'] as const;
export const RESUME_ANALYSIS_QUERY_KEY = (resumeId: string) =>
  ['student', 'resume-analysis', resumeId] as const;

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

/**
 * Hook to retrieve AI analysis status and result for a specific resume.
 * Intelligently polls every 3 seconds only while the analysis status is 'PROCESSING'.
 * Stops polling automatically once a terminal state ('COMPLETED' or 'FAILED') is reached.
 */
export function useResumeAnalysis(resumeId: string, enabled: boolean = true) {
  return useQuery<GetAnalysisData | null, Error>({
    queryKey: RESUME_ANALYSIS_QUERY_KEY(resumeId),
    queryFn: () => getResumeAnalysis(resumeId),
    enabled: Boolean(resumeId && enabled),
    staleTime: 60 * 1000,
    retry: 1,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Only poll when status is PROCESSING
      if (data?.status === 'PROCESSING') {
        return 3000;
      }
      return false;
    },
  });
}

/**
 * Hook to trigger AI resume analysis.
 * Sets optimistic PROCESSING state in query cache and invalidates resumes list.
 */
export function useTriggerResumeAnalysis() {
  const queryClient = useQueryClient();

  return useMutation<TriggerAnalysisData, Error, { resumeId: string }>({
    mutationFn: ({ resumeId }) => triggerResumeAnalysis(resumeId),
    onSuccess: (data, { resumeId }) => {
      // 1. Optimistically set analysis status to PROCESSING in cache
      queryClient.setQueryData<GetAnalysisData>(
        RESUME_ANALYSIS_QUERY_KEY(resumeId),
        {
          status: 'PROCESSING',
          analysis: null,
        }
      );

      // 2. Invalidate analysis query to initiate polling cycle
      queryClient.invalidateQueries({
        queryKey: RESUME_ANALYSIS_QUERY_KEY(resumeId),
      });

      // 3. Invalidate resumes list so has_analysis updates
      queryClient.invalidateQueries({
        queryKey: RESUMES_QUERY_KEY,
      });
    },
  });
}
