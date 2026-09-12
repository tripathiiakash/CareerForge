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
