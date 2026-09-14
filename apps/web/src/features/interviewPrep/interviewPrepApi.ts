import { apiClient, extractApiError } from '@/lib/api';
import { InterviewPrepData, InterviewPrepResponse } from './types';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | undefined | null): boolean {
  return Boolean(id && UUID_REGEX.test(id.trim()));
}

/**
 * React Query key factory functions for AI Interview Preparation.
 * Structure: ['interviewPrep', jobId]
 */
export const INTERVIEW_PREP_ROOT_KEY = ['interviewPrep'] as const;

export function interviewPrepQueryKey(jobId: string) {
  return ['interviewPrep', jobId] as const;
}

/**
 * Generates tailored interview preparation questions for an applied job.
 * Adheres strictly to docs/API.md §5.6.
 * POST /api/v1/jobs/:jobId/interview-prep
 */
export async function generateInterviewPrep(
  jobId: string
): Promise<InterviewPrepData> {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid jobId format (must be a valid UUID)');
  }

  const response = await apiClient.post<InterviewPrepResponse>(
    `/jobs/${encodeURIComponent(jobId)}/interview-prep`
  );

  const raw = response.data?.data;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid response format: missing data payload');
  }

  if (!Array.isArray(raw.questions)) {
    throw new Error('Invalid response format: questions must be an array');
  }

  return {
    job_title: typeof raw.job_title === 'string' ? raw.job_title : '',
    questions: raw.questions.map((q) =>
      typeof q === 'string' ? q : String(q)
    ),
  };
}

export { extractApiError };
