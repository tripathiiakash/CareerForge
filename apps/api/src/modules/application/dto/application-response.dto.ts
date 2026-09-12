export interface ApplicationCreatedData {
  application_id: string;
  status: 'APPLIED';
  applied_at: Date | string;
  message: string;
}

export interface ApplyJobResponseDto {
  success: true;
  data: ApplicationCreatedData;
}

export interface StudentApplicationJobSummary {
  id: string;
  title: string;
  employment_type: string;
  company_name: string;
}

export interface StudentApplicationItem {
  application_id: string;
  status: string;
  applied_at: Date | string;
  updated_at: Date | string;
  job: StudentApplicationJobSummary;
}

export interface ListStudentApplicationsPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListStudentApplicationsResponseDto {
  success: true;
  data: StudentApplicationItem[];
  meta: ListStudentApplicationsPaginationMeta;
}

export interface JobApplicantStudentSummary {
  id: string;
  first_name: string;
  last_name: string;
  university: string | null;
  degree: string | null;
  graduation_year: number | null;
  skills: string[];
}

export interface JobApplicantResumeSummary {
  id: string;
  file_url: string;
}

export interface JobApplicantItem {
  application_id: string;
  student: JobApplicantStudentSummary;
  resume: JobApplicantResumeSummary;
  status: string;
  applied_at: Date | string;
}

export interface ListJobApplicantsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListJobApplicantsResponseDto {
  success: true;
  data: JobApplicantItem[];
  meta: ListJobApplicantsMeta;
}
