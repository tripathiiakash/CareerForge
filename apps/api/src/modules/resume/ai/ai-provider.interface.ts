export interface ResumeAnalysisPromptInput {
  resumeText: string;
}

export interface ResumeAnalysisResult {
  score: number;
  missingSkills: string[];
  formattingTips: string[];
}

export interface IAiProvider {
  analyzeResume(
    input: ResumeAnalysisPromptInput
  ): Promise<ResumeAnalysisResult>;
}

export const AI_PROVIDER_TOKEN = Symbol('AI_PROVIDER_TOKEN');
