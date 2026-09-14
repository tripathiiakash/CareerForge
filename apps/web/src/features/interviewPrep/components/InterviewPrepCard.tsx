import React from 'react';
import { useGenerateInterviewPrep } from '../hooks';
import { InterviewPrepData } from '../types';
import { InterviewPrepIdle } from './InterviewPrepIdle';
import { InterviewPrepLoading } from './InterviewPrepLoading';
import { InterviewPrepQuestions } from './InterviewPrepQuestions';
import { InterviewPrepError } from './InterviewPrepError';

export interface InterviewPrepCardProps {
  jobId: string;
  jobTitle?: string;
  initialData?: InterviewPrepData;
  className?: string;
}

/**
 * Top-level container component for AI Interview Preparation.
 * Automatically coordinates idle, loading, success, and error states using
 * the useGenerateInterviewPrep mutation hook.
 */
export const InterviewPrepCard: React.FC<InterviewPrepCardProps> = ({
  jobId,
  jobTitle,
  initialData,
  className,
}) => {
  const mutation = useGenerateInterviewPrep(jobId);

  const currentData = mutation.data || initialData;

  // 1. Loading State (Generating questions in flight)
  if (mutation.isPending) {
    return <InterviewPrepLoading jobTitle={jobTitle} className={className} />;
  }

  // 2. Error State (Failed generation with no previously resolved data)
  if (mutation.isError && !currentData) {
    return (
      <InterviewPrepError
        error={mutation.error}
        onRetry={() => mutation.mutate()}
        isRetrying={mutation.isPending}
        className={className}
      />
    );
  }

  // 3. Success State (Displaying 5 tailored questions)
  if (currentData) {
    return (
      <InterviewPrepQuestions
        data={currentData}
        onRegenerate={() => mutation.mutate()}
        isRegenerating={mutation.isPending}
        className={className}
      />
    );
  }

  // 4. Idle State (Call to action)
  return (
    <InterviewPrepIdle
      jobTitle={jobTitle}
      onGenerate={() => mutation.mutate()}
      isPending={mutation.isPending}
      className={className}
    />
  );
};
