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

/**
 * AI Resume Analysis types adhering to docs/API.md §7.1 & §7.2
 * and backend ResumeAnalysisService / DTOs.
 */

export interface AnalysisDetailDto {
  score: number;
  missing_skills: string[];
  formatting_tips: string[];
  created_at: string;
}

export interface AnalysisProcessingData {
  status: 'PROCESSING';
  analysis: null;
}

export interface AnalysisCompletedData {
  status: 'COMPLETED';
  analysis: AnalysisDetailDto;
}

export interface AnalysisFailedData {
  status: 'FAILED';
  error_message: string;
  analysis: null;
}

export type GetAnalysisData =
  AnalysisProcessingData | AnalysisCompletedData | AnalysisFailedData;

export interface GetAnalysisResponseDto {
  success: true;
  data: GetAnalysisData;
}

export interface TriggerAnalysisData {
  resume_id: string;
  status: 'PROCESSING';
  message: string;
}

export interface TriggerAnalysisResponseDto {
  success: true;
  data: TriggerAnalysisData;
}
