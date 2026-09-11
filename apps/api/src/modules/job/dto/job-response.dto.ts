export interface JobCreatedData {
  id: string;
  status: 'PENDING';
  message: string;
}

export interface CreateJobResponseDto {
  success: true;
  data: JobCreatedData;
}
