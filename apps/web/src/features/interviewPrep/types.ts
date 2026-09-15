/**
 * Domain & API types for AI Interview Preparation.
 * Adheres strictly to docs/API.md §5.6 and backend DTOs.
 */

/**
 * Explicit 5-question tuple type matching the backend contract guarantee.
 */
export type InterviewPrepQuestionsList = [
  string,
  string,
  string,
  string,
  string,
];

export interface InterviewPrepData {
  job_title: string;
  /**
   * Tailored interview questions (explicitly expected to contain exactly 5 strings).
   */
  questions: string[];
}

export interface InterviewPrepResponse {
  success: boolean;
  data: InterviewPrepData;
}
