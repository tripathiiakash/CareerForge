export interface JobCreatedData {
  id: string;
  status: 'PENDING';
  message: string;
}

export interface CreateJobResponseDto {
  success: true;
  data: JobCreatedData;
}

export interface JobUpdatedData {
  id: string;
  title: string;
  status: string;
  message: string;
}

export interface UpdateJobResponseDto {
  success: true;
  data: JobUpdatedData;
}

export interface DeleteJobResponseDto {
  success: true;
  message: string;
}

export interface JobCompanySummary {
  id: string;
  name: string;
  logo_url: string | null;
}

export interface JobListItem {
  id: string;
  title: string;
  company: JobCompanySummary;
  required_skills: string[];
  employment_type: string;
  created_at: Date | string;
}

export interface ListJobsPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListJobsResponseDto {
  success: true;
  data: JobListItem[];
  meta: ListJobsPaginationMeta;
}

export interface JobModeratedData {
  id: string;
  status: string;
  message: string;
}

export interface ModerateJobStatusResponseDto {
  success: true;
  data: JobModeratedData;
}

export interface JobDetailCompany {
  id: string;
  name: string;
  website: string | null;
  logo_url: string | null;
}

export interface JobDetailData {
  id: string;
  title: string;
  description: string;
  required_skills: string[];
  employment_type: string;
  company: JobDetailCompany;
  created_at: Date | string;
  has_applied?: boolean;
}

export interface GetJobDetailResponseDto {
  success: true;
  data: JobDetailData;
}
