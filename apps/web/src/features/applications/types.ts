/**
 * Domain & API types for Student Application Tracking.
 * Adheres strictly to docs/API.md §2.3.
 */

export type ApplicationStatus = 'APPLIED' | 'SHORTLISTED' | 'REJECTED';

export interface StudentApplicationJob {
  id: string;
  title: string;
  employment_type: string;
  company_name: string;
}

export interface StudentApplicationItem {
  application_id: string;
  status: ApplicationStatus;
  applied_at: string;
  updated_at: string;
  job: StudentApplicationJob;
}

export interface ApplicationsPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListStudentApplicationsResponse {
  success: boolean;
  data: StudentApplicationItem[];
  meta: ApplicationsPaginationMeta;
}

export interface ApplicationFilterParams {
  page?: number;
  limit?: number;
  status?: ApplicationStatus | '';
}
