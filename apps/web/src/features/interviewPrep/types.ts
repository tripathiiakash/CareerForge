/**
 * Domain & API types for AI Interview Preparation.
 * Adheres strictly to docs/API.md §5.6 and backend DTOs.
 */

export interface InterviewPrepData {
  job_title: string;
  questions: string[];
}

export interface InterviewPrepResponse {
  success: boolean;
  data: InterviewPrepData;
}
