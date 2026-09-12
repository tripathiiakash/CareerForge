/**
 * Resume domain types adhering to docs/API.md §6.1 & §6.2
 * and backend ResumeController / ResumeService.
 */

export interface StudentResumeItem {
  id: string;
  file_url: string;
  is_primary: boolean;
  has_analysis: boolean;
  created_at: string;
}

export interface StudentResumesResponse {
  success: boolean;
  data: StudentResumeItem[];
}

export interface UploadResumeData {
  id: string;
  file_url: string;
  is_primary: boolean;
  message: string;
}

export interface UploadResumeResponse {
  success: boolean;
  data: UploadResumeData;
}

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}
