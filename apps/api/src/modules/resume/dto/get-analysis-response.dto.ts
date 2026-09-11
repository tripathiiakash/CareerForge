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
