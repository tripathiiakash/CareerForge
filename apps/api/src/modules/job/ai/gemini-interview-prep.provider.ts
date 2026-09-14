import { Injectable, Logger } from '@nestjs/common';
import { interviewPrepOutputSchema } from '@careerforge/validation';
import { ConfigService } from '../../../core/config/config.service';
import {
  IInterviewPrepProvider,
  InterviewPrepPromptInput,
  InterviewPrepResult,
} from './interview-prep-provider.interface';

const MAX_JOB_DESC_CHARS = 10000;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Safely sanitizes user-provided text interpolated inside prompt delimiters.
 * Escapes triple-quotes and triple-backticks to prevent prompt delimiter breakout
 * while fully preserving normal text, punctuation, and code samples.
 */
export function escapePromptDelimiters(text: string): string {
  if (!text) return '';
  return text.replace(/"""/g, '\\"\\"\\"').replace(/```/g, '\\`\\`\\`');
}

@Injectable()
export class GeminiInterviewPrepProvider implements IInterviewPrepProvider {
  private readonly logger = new Logger(GeminiInterviewPrepProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async generateQuestions(
    input: InterviewPrepPromptInput
  ): Promise<InterviewPrepResult> {
    const apiKey = this.configService.geminiApiKey;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not configured on the server. Cannot execute AI interview prep.'
      );
    }

    const rawDescription = (input.jobDescription || '').slice(
      0,
      MAX_JOB_DESC_CHARS
    );
    const sanitizedDescription = escapePromptDelimiters(rawDescription);
    const sanitizedTitle = escapePromptDelimiters(input.jobTitle || '');

    const requiredSkillsList = escapePromptDelimiters(
      input.requiredSkills && input.requiredSkills.length > 0
        ? input.requiredSkills.join(', ')
        : 'General technical skills'
    );
    const candidateSkillsList = escapePromptDelimiters(
      input.studentSkills && input.studentSkills.length > 0
        ? input.studentSkills.join(', ')
        : 'Not specified'
    );

    const prompt = `You are an expert technical interviewer and career coach.
Generate tailored, realistic, and high-signal interview preparation questions for a student candidate applying for the job below.

Job Details:
- Title: ${sanitizedTitle}
- Employment Type: ${input.employmentType}
- Required Skills: ${requiredSkillsList}
- Job Description:
"""
${sanitizedDescription}
"""

Candidate Profile:
- Skills: ${candidateSkillsList}

Task:
Generate EXACTLY 5 tailored interview preparation questions that test:
1. Core technical competencies and skills required by this role.
2. The intersection of the candidate's skills with the job requirements.
3. System design, API architecture, or practical debugging scenarios relevant to this position.
4. Problem-solving and behavioral engineering judgment.


Return strictly a valid JSON object matching this schema:
{
  "job_title": "${input.jobTitle}",
  "questions": [
    "Question 1 text...",
    "Question 2 text...",
    "Question 3 text...",
    "Question 4 text...",
    "Question 5 text..."
  ]
}

Constraints:
- You must return EXACTLY 5 questions in the "questions" array.
- Do NOT return fewer than 5 or more than 5 questions.
- Return strictly a raw JSON object. Do not wrap with markdown code fences or conversational prose.`;

    const requestUrl = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    };

    try {
      this.logger.log(
        `Dispatching interview prep generation for "${input.jobTitle}" to Gemini API...`
      );
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
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

      const cleanJsonText = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsedJson: unknown = JSON.parse(cleanJsonText);
      const validated = interviewPrepOutputSchema.parse(parsedJson);

      return {
        job_title: validated.job_title,
        questions: validated.questions,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to generate interview prep with Gemini: ${errorMessage}`
      );
      throw error;
    }
  }
}
