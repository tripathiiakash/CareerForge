import { Injectable, Logger } from '@nestjs/common';
import {
  IAiProvider,
  ResumeAnalysisPromptInput,
  ResumeAnalysisResult,
} from './ai-provider.interface';

@Injectable()
export class MockAiProvider implements IAiProvider {
  private readonly logger = new Logger(MockAiProvider.name);

  async analyzeResume(
    input: ResumeAnalysisPromptInput
  ): Promise<ResumeAnalysisResult> {
    this.logger.log('Executing deterministic mock AI resume analysis...');

    const text = input.resumeText.toLowerCase();

    const missingSkills: string[] = [];
    if (!text.includes('docker')) missingSkills.push('Docker');
    if (!text.includes('ci/cd') && !text.includes('continuous integration'))
      missingSkills.push('CI/CD');
    if (!text.includes('kubernetes')) missingSkills.push('Kubernetes');
    if (!text.includes('testing') && !text.includes('jest'))
      missingSkills.push('Unit Testing');

    const formattingTips: string[] = [
      'Use action verbs (e.g., "Engineered", "Optimized") at the start of each bullet point.',
      'Quantify results where possible (e.g., "reduced latency by 35%").',
      'Ensure standard section headings: Experience, Education, Skills, Projects.',
    ];

    // Simple deterministic score estimation based on length and skill presence
    let baseScore = 65;
    if (text.length > 500) baseScore += 10;
    if (text.length > 1500) baseScore += 10;
    if (missingSkills.length <= 2) baseScore += 10;
    const score = Math.min(Math.max(baseScore, 0), 100);

    return {
      score,
      missingSkills,
      formattingTips,
    };
  }
}
