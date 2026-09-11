import { Injectable, Logger } from '@nestjs/common';
import { aiResumeAnalysisOutputSchema } from '@careerforge/validation';
import { ConfigService } from '../../../core/config/config.service';
import {
  IAiProvider,
  ResumeAnalysisPromptInput,
  ResumeAnalysisResult,
} from './ai-provider.interface';

const MAX_RESUME_TEXT_CHARS = 12000;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

@Injectable()
export class GeminiProvider implements IAiProvider {
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async analyzeResume(
    input: ResumeAnalysisPromptInput
  ): Promise<ResumeAnalysisResult> {
    const apiKey = this.configService.geminiApiKey;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured on the server. Cannot execute AI analysis.'
      );
    }

    // Cost-control: truncate text to maximum safe character boundary
    const sanitizedText = (input.resumeText || '').slice(
      0,
      MAX_RESUME_TEXT_CHARS
    );

    const prompt = `You are an expert Technical Recruiter and ATS (Applicant Tracking System) resume analyzer.
Analyze the provided resume text objectively. Do NOT fabricate, invent, or assume any work experience, skills, degrees, or certifications that are not explicitly stated in the text.

Evaluate the resume and return a strict JSON object with the following schema:
- "score": an integer between 0 and 100 representing overall ATS score, clarity, relevant skills, and quantifiable impact.
- "missing_skills": an array of strings (maximum 15 items) containing important modern technical or domain skills commonly expected for technical roles that are absent in this resume.
- "formatting_tips": an array of strings (maximum 8 items) containing actionable advice to improve readability, structure, bullet points, or metric quantification.

Resume Text:
"""
${sanitizedText}
"""

Return strictly a raw JSON object matching the schema. Do not wrap in markdown tags or include conversational commentary.`;

    const requestUrl = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    };

    try {
      this.logger.log('Dispatching resume analysis to Gemini API...');
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60000), // 60-second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.logger.error(
          `Gemini API returned HTTP ${response.status}: ${response.statusText}`
        );
        throw new Error(
          `Gemini API request failed with status ${response.status}`
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawContent) {
        throw new Error('Gemini API returned an empty response candidate.');
      }

      // Strip markdown code fences if present (e.g. ```json ... ```)
      const cleanJsonText = rawContent
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsedJson: unknown = JSON.parse(cleanJsonText);

      // Validate structured schema using shared Zod definition
      const validated = aiResumeAnalysisOutputSchema.parse(parsedJson);

      return {
        score: validated.score,
        missingSkills: validated.missing_skills,
        formattingTips: validated.formatting_tips,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to analyze resume with Gemini: ${errorMessage}`
      );
      throw error;
    }
  }
}
