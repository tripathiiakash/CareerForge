export interface TriggerAnalysisData {
  resume_id: string;
  status: 'PROCESSING';
  message: string;
}

export interface TriggerAnalysisResponseDto {
  success: true;
  data: TriggerAnalysisData;
}
