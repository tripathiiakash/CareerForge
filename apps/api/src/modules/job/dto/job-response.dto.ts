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
