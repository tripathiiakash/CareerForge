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
