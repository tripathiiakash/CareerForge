/**
 * Job Board and Job Details domain & API types
 * Adheres strictly to docs/API.md §5.2 and §5.3
 */

export type EmploymentType = 'INTERNSHIP' | 'FULL_TIME';

export interface JobCompany {
  id: string;
  name: string;
  logo_url: string | null;
  website?: string | null;
}

export interface JobListItem {
  id: string;
  title: string;
  company: JobCompany;
  required_skills: string[];
  employment_type: EmploymentType;
  created_at: string;
}

export interface JobDetail {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  employment_type: EmploymentType;
  company: JobCompany;
  has_applied?: boolean;
  created_at: string;
}

export interface JobsPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListJobsResponse {
  success: boolean;
  data: JobListItem[];
  meta: JobsPaginationMeta;
}

export interface JobDetailResponse {
  success: boolean;
  data: JobDetail;
}

export interface JobFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  skills?: string;
  employment_type?: EmploymentType | '';
}
