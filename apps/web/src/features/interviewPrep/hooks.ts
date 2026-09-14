import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateInterviewPrep,
  interviewPrepQueryKey,
} from './interviewPrepApi';
import { InterviewPrepData } from './types';

/**
 * React Query mutation hook to generate AI interview preparation questions for an applied job.
 * Adheres strictly to docs/API.md §5.6.
 *
 * @param jobId Optional job UUID passed at hook initialization. Can also be supplied to mutate(jobId).
 */
export function useGenerateInterviewPrep(jobId?: string) {
  const queryClient = useQueryClient();

  return useMutation<InterviewPrepData, Error, string | void>({
    mutationFn: (overrideJobId) => {
      const targetJobId = overrideJobId || jobId;
      if (!targetJobId) {
        throw new Error('Invalid jobId format (must be a valid UUID)');
      }
      return generateInterviewPrep(targetJobId);
    },
    onSuccess: (data, overrideJobId) => {
      const targetJobId = overrideJobId || jobId;
      if (targetJobId) {
        queryClient.setQueryData<InterviewPrepData>(
          interviewPrepQueryKey(targetJobId),
          data
        );
      }
    },
  });
}

export const useInterviewPrepMutation = useGenerateInterviewPrep;
