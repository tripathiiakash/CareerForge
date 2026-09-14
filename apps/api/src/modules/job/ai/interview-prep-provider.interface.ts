export interface InterviewPrepPromptInput {
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  employmentType: string;
  studentSkills: string[];
}

export interface InterviewPrepResult {
  job_title: string;
  questions: string[];
}

export interface IInterviewPrepProvider {
  generateQuestions(
    input: InterviewPrepPromptInput
  ): Promise<InterviewPrepResult>;
}

export const INTERVIEW_PREP_PROVIDER_TOKEN = Symbol(
  'INTERVIEW_PREP_PROVIDER_TOKEN'
);
