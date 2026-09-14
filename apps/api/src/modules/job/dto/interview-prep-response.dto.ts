export interface InterviewPrepData {
  job_title: string;
  questions: string[];
}

export interface InterviewPrepResponseDto {
  success: true;
  data: InterviewPrepData;
}
