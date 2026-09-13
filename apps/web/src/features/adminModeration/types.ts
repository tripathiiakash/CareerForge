/**
 * Domain & API types for Admin Job Moderation.
 * Adheres strictly to docs/API.md §9.1 and §9.2.
 */

export type AdminModerationJobStatus = 'ACTIVE' | 'REJECTED';

export interface PendingJobRecruiter {
  first_name: string;
  last_name: string;
  email: string;
}

export interface PendingJobCompany {
  name: string;
}

export interface PendingJob {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  employment_type: 'FULL_TIME' | 'INTERNSHIP' | string;
  recruiter: PendingJobRecruiter;
  company: PendingJobCompany;
  created_at: string;
}

export interface ListPendingJobsQuery {
  page?: number;
  limit?: number;
}

export interface ListPendingJobsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListPendingJobsResponse {
  success: boolean;
  data: PendingJob[];
  meta: ListPendingJobsMeta;
}

export interface ModerateJobStatusPayload {
  status: AdminModerationJobStatus;
}

export interface ModerateJobStatusData {
  id: string;
  status: AdminModerationJobStatus;
  message: string;
}

export interface ModerateJobStatusResponse {
  success: boolean;
  data: ModerateJobStatusData;
}
