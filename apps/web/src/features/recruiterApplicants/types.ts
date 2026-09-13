/**
 * Domain & API types for Recruiter Applicant Management.
 * Adheres strictly to docs/API.md §8.2 and §8.3.
 */

export type ApplicantStatus = 'APPLIED' | 'SHORTLISTED' | 'REJECTED';

export interface RecruiterApplicantStudent {
  id: string;
  first_name: string;
  last_name: string;
  university: string | null;
  degree: string | null;
  graduation_year: number | null;
  skills: string[];
}

export interface RecruiterApplicantResume {
  id: string;
  file_url: string;
}

export interface JobApplicant {
  application_id: string;
  student: RecruiterApplicantStudent;
  resume: RecruiterApplicantResume;
  status: ApplicantStatus;
  applied_at: string;
}

export interface ListJobApplicantsQuery {
  page?: number;
  limit?: number;
  status?: ApplicantStatus;
}

export interface ListJobApplicantsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListJobApplicantsResponse {
  success: boolean;
  data: JobApplicant[];
  meta: ListJobApplicantsMeta;
}

export interface UpdateApplicationStatusPayload {
  status: 'SHORTLISTED' | 'REJECTED';
}

export interface UpdateApplicationStatusData {
  application_id: string;
  status: 'SHORTLISTED' | 'REJECTED';
  updated_at: string;
}

export interface UpdateApplicationStatusResponse {
  success: boolean;
  data: UpdateApplicationStatusData;
}
