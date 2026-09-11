const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { GeminiProvider } = require('../dist/modules/resume/ai/gemini.provider');
const { MockAiProvider } = require('../dist/modules/resume/ai/mock-ai.provider');
const { aiResumeAnalysisOutputSchema } = require('@careerforge/validation');

describe('AI Provider Test Suite', () => {
  describe('GeminiProvider', () => {
    it('should throw an error if GEMINI_API_KEY is not configured', async () => {
      const mockConfigService = { geminiApiKey: undefined };
      const provider = new GeminiProvider(mockConfigService);

      await assert.rejects(
        () => provider.analyzeResume({ resumeText: 'Developer resume text' }),
        {
          message:
            'GEMINI_API_KEY is not configured on the server. Cannot execute AI analysis.',
        }
      );
    });

    it('should resolve gemini-2.5-flash model and send application/json mime type', async () => {
      let capturedUrl = '';
      let capturedBody = null;

      const mockConfigService = { geminiApiKey: 'secret-server-key-123' };
      const provider = new GeminiProvider(mockConfigService);

      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = async (url, options) => {
        capturedUrl = url;
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        score: 88,
                        missing_skills: ['Docker', 'AWS'],
                        formatting_tips: ['Use quantifiable metrics'],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      };

      try {
        const result = await provider.analyzeResume({
          resumeText: 'Full-stack TypeScript developer with React & NestJS',
        });

        // 1. Verify model in request URL
        assert.ok(
          capturedUrl.includes('/models/gemini-2.5-flash:generateContent'),
          `URL should target gemini-2.5-flash but was: ${capturedUrl}`
        );

        // 2. Verify server-side API key passed
        assert.ok(
          capturedUrl.includes('key=secret-server-key-123'),
          'URL should contain the configured server API key'
        );

        // 3. Verify structured JSON output configuration
        assert.equal(
          capturedBody.generationConfig.responseMimeType,
          'application/json'
        );
        assert.equal(capturedBody.generationConfig.temperature, 0.2);

        // 4. Verify result mapping
        assert.equal(result.score, 88);
        assert.deepEqual(result.missingSkills, ['Docker', 'AWS']);
        assert.deepEqual(result.formattingTips, ['Use quantifiable metrics']);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should safely strip markdown code fences from model response', async () => {
      const mockConfigService = { geminiApiKey: 'key' };
      const provider = new GeminiProvider(mockConfigService);

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{\n  "score": 92,\n  "missing_skills": ["GraphQL"],\n  "formatting_tips": ["Add GitHub links"]\n}\n```\n',
                  },
                ],
              },
            },
          ],
        }),
      });

      try {
        const result = await provider.analyzeResume({ resumeText: 'Resume' });
        assert.equal(result.score, 92);
        assert.deepEqual(result.missingSkills, ['GraphQL']);
        assert.deepEqual(result.formattingTips, ['Add GitHub links']);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should reject malformed JSON syntax returned by the model', async () => {
      const mockConfigService = { geminiApiKey: 'key' };
      const provider = new GeminiProvider(mockConfigService);

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'This is not valid JSON at all.' }],
              },
            },
          ],
        }),
      });

      try {
        await assert.rejects(
          () => provider.analyzeResume({ resumeText: 'Resume text' }),
          (err) => err instanceof SyntaxError
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should reject schema-invalid responses (score out of bounds, missing fields)', async () => {
      const mockConfigService = { geminiApiKey: 'key' };
      const provider = new GeminiProvider(mockConfigService);

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      score: 150, // exceeds max 100
                      missing_skills: 'not-an-array',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

      try {
        await assert.rejects(
          () => provider.analyzeResume({ resumeText: 'Resume text' }),
          (err) => err.name === 'ZodError'
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle HTTP error responses safely without leaking API key in error message', async () => {
      const mockConfigService = { geminiApiKey: 'sensitive-api-key-999' };
      const provider = new GeminiProvider(mockConfigService);

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Quota exceeded',
      });

      try {
        await assert.rejects(
          () => provider.analyzeResume({ resumeText: 'Resume text' }),
          (err) => {
            assert.ok(
              err.message.includes('403'),
              'Error message should include status 403'
            );
            assert.ok(
              !err.message.includes('sensitive-api-key-999'),
              'Error message must NEVER include the API key'
            );
            return true;
          }
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should enforce 12,000 character maximum limit on prompt text', async () => {
      let capturedBody = null;
      const mockConfigService = { geminiApiKey: 'key' };
      const provider = new GeminiProvider(mockConfigService);

      const originalFetch = global.fetch;
      global.fetch = async (url, options) => {
        capturedBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        score: 75,
                        missing_skills: [],
                        formatting_tips: [],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      };

      try {
        const largeText = 'A'.repeat(25000);
        await provider.analyzeResume({ resumeText: largeText });

        const sentPrompt = capturedBody.contents[0].parts[0].text;
        // Prompt includes instruction template + at most 12000 characters of resume text
        assert.ok(
          !sentPrompt.includes('A'.repeat(12001)),
          'Prompt must truncate resume text to at most 12,000 characters'
        );
        assert.ok(
          sentPrompt.includes('A'.repeat(12000)),
          'Prompt should contain exactly 12,000 characters of truncated text'
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('MockAiProvider', () => {
    it('should return deterministic scores and suggestions that satisfy the Zod schema', async () => {
      const mockProvider = new MockAiProvider();

      const result = await mockProvider.analyzeResume({
        resumeText:
          'Software Engineer experienced in Node.js, TypeScript, and SQL databases.',
      });

      assert.ok(
        result.score >= 0 && result.score <= 100,
        'Score must be within 0-100'
      );
      assert.ok(Array.isArray(result.missingSkills));
      assert.ok(Array.isArray(result.formattingTips));

      // Validate against the shared Zod schema
      const validated = aiResumeAnalysisOutputSchema.parse({
        score: result.score,
        missing_skills: result.missingSkills,
        formatting_tips: result.formattingTips,
      });

      assert.equal(validated.score, result.score);
    });

    it('should detect missing skills accurately', async () => {
      const mockProvider = new MockAiProvider();

      const withoutDocker = await mockProvider.analyzeResume({
        resumeText: 'Frontend Developer with React and CSS',
      });
      assert.ok(withoutDocker.missingSkills.includes('Docker'));

      const withDocker = await mockProvider.analyzeResume({
        resumeText:
          'Backend Developer with Docker, Kubernetes, CI/CD, and Jest unit testing',
      });
      assert.ok(!withDocker.missingSkills.includes('Docker'));
      assert.ok(!withDocker.missingSkills.includes('Kubernetes'));
    });
  });
});
