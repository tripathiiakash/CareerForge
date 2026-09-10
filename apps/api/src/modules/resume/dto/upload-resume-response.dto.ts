export interface UploadResumeData {
  id: string;
  file_url: string;
  is_primary: boolean;
  message: string;
}

export interface UploadResumeResponseDto {
  success: boolean;
  data: UploadResumeData;
}
