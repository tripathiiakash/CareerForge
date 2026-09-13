export type EmploymentType = 'INTERNSHIP' | 'FULL_TIME';

export type JobStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';

export interface JobCompany {
  id: string;
  name: string;
  logo_url: string | null;
  website?: string | null;
}

export interface RecruiterJobItem {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  employment_type: EmploymentType;
  company: JobCompany;
  status: JobStatus;
  created_at: string;
}

export interface ListRecruiterJobsResponse {
  success: boolean;
  data: RecruiterJobItem[];
}

export interface JobCreatedData {
  id: string;
  status: 'PENDING';
  message: string;
}

export interface CreateJobResponse {
  success: boolean;
  data: JobCreatedData;
}

export interface JobUpdatedData {
  id: string;
  title: string;
  status: string;
  message: string;
}

export interface UpdateJobResponse {
  success: boolean;
  data: JobUpdatedData;
}

export interface DeleteJobResponse {
  success: boolean;
  message: string;
}

export interface JobFormData {
  title: string;
  description: string;
  required_skills: string;
  employment_type: EmploymentType;
}
