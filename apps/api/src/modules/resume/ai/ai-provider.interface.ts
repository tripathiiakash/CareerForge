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

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = true
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export const AI_PROVIDER_TOKEN = Symbol('AI_PROVIDER_TOKEN');
