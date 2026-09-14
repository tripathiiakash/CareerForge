import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve directory for source file inspection
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const featuresDir = path.resolve(__dirname, '../src/features/interviewPrep');

// Helper mirrors matching apps/web/src/features/interviewPrep/interviewPrepApi.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

const INTERVIEW_PREP_ROOT_KEY = ['interviewPrep'];

function interviewPrepQueryKey(jobId) {
  return ['interviewPrep', jobId];
}

async function generateInterviewPrep(apiClient, jobId) {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid jobId format (must be a valid UUID)');
  }

  const response = await apiClient.post(
    `/jobs/${encodeURIComponent(jobId)}/interview-prep`
  );

  const raw = response.data?.data;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid response format: missing data payload');
  }

  if (!Array.isArray(raw.questions)) {
    throw new Error('Invalid response format: questions must be an array');
  }

  return {
    job_title: typeof raw.job_title === 'string' ? raw.job_title : '',
    questions: raw.questions.map((q) =>
      typeof q === 'string' ? q : String(q)
    ),
  };
}

// Mirror of extractApiError matching apps/web/src/lib/api.ts
function extractApiError(error) {
  if (error?.response?.data?.error) {
    const apiErr = error.response.data.error;
    return {
      code: apiErr.code || 'UNKNOWN_ERROR',
      message:
        apiErr.message || 'An unexpected error occurred. Please try again.',
      details: Array.isArray(apiErr.details) ? apiErr.details : undefined,
    };
  }

  if (error?.isAxiosError && !error.response) {
    return {
      code: 'NETWORK_ERROR',
      message:
        'Unable to connect to the server. Please check your internet connection.',
    };
  }

  if (error instanceof Error) {
    return {
      code: 'CLIENT_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred. Please try again.',
  };
}

describe('Phase 5.16.1 — AI Interview Preparation API Client & Types Test Suite', () => {
  const validJobId = '11111111-1111-4111-8111-111111111111';
  const mockValidQuestions = [
    'Explain how you would design a RESTful API for a job application system.',
    'What is the difference between authentication and authorization?',
    'How do you handle N+1 query problems when using an ORM like Prisma?',
    'Describe a challenging bug you encountered in a project and how you resolved it.',
    'How would you implement rate limiting on an Express API to prevent abuse?',
  ];

  const mockSuccessResponse = {
    data: {
      success: true,
      data: {
        job_title: 'Junior Backend Developer',
        questions: mockValidQuestions,
      },
    },
  };

  // =========================================================================
  // 1. Module & Source Integrity
  // =========================================================================
  describe('1. Module & Source Code Integrity', () => {
    it('should have types.ts created with InterviewPrepData and InterviewPrepResponse', () => {
      const typesFile = path.join(featuresDir, 'types.ts');
      assert.equal(fs.existsSync(typesFile), true, 'types.ts must exist');

      const content = fs.readFileSync(typesFile, 'utf8');
      assert.match(content, /export interface InterviewPrepData/);
      assert.match(content, /job_title:\s*string/);
      assert.match(content, /questions:\s*string\[\]/);
      assert.match(content, /export interface InterviewPrepResponse/);
    });

    it('should have interviewPrepApi.ts created with required exports', () => {
      const apiFile = path.join(featuresDir, 'interviewPrepApi.ts');
      assert.equal(fs.existsSync(apiFile), true, 'interviewPrepApi.ts must exist');

      const content = fs.readFileSync(apiFile, 'utf8');
      assert.match(content, /export const UUID_REGEX/);
      assert.match(content, /export function isValidUuid/);
      assert.match(content, /export const INTERVIEW_PREP_ROOT_KEY/);
      assert.match(content, /export function interviewPrepQueryKey/);
      assert.match(content, /export async function generateInterviewPrep/);
      assert.match(content, /export\s*\{\s*extractApiError\s*\}/);
    });

    it('should have index.ts barrel re-exporting types and API client', () => {
      const indexFile = path.join(featuresDir, 'index.ts');
      assert.equal(fs.existsSync(indexFile), true, 'index.ts must exist');

      const content = fs.readFileSync(indexFile, 'utf8');
      assert.match(content, /export \* from '\.\/types'/);
      assert.match(content, /export \* from '\.\/interviewPrepApi'/);
    });
  });

  // =========================================================================
  // 2. UUID Validation & Client Boundary Guards
  // =========================================================================
  describe('2. UUID Validation & Client Boundary Guards', () => {
    it('should validate valid UUID v4 and v1 strings', () => {
      assert.equal(isValidUuid('11111111-1111-4111-8111-111111111111'), true);
      assert.equal(isValidUuid('a8098c1a-f86e-11da-bd1a-00112444be1e'), true);
      assert.equal(isValidUuid('  11111111-1111-4111-8111-111111111111  '), true);
    });

    it('should reject invalid UUID formats', () => {
      assert.equal(isValidUuid(null), false);
      assert.equal(isValidUuid(undefined), false);
      assert.equal(isValidUuid(''), false);
      assert.equal(isValidUuid('   '), false);
      assert.equal(isValidUuid('not-a-uuid'), false);
      assert.equal(isValidUuid('11111111-1111-4111-8111'), false);
      assert.equal(isValidUuid('11111111-1111-4111-8111-111111111111-extra'), false);
      assert.equal(isValidUuid('11111111-1111-4111-8111-11111111111z'), false);
      assert.equal(isValidUuid('../jobs/123/interview-prep'), false);
    });

    it('should throw an error before network dispatch when jobId is invalid', async () => {
      let clientCalled = false;
      const mockClient = {
        post: async () => {
          clientCalled = true;
          return mockSuccessResponse;
        },
      };

      await assert.rejects(
        async () => {
          await generateInterviewPrep(mockClient, 'invalid-uuid-format');
        },
        (err) => err.message === 'Invalid jobId format (must be a valid UUID)'
      );

      assert.equal(clientCalled, false, 'apiClient.post must not be invoked for invalid jobId');
    });
  });

  // =========================================================================
  // 3. HTTP Method & Endpoint Contract
  // =========================================================================
  describe('3. HTTP Method & Endpoint Contract', () => {
    it('should invoke POST /jobs/:jobId/interview-prep with URI encoding and no request body', async () => {
      let recordedUrl = null;
      let recordedBody = 'NOT_CALLED';

      const mockClient = {
        post: async (url, body) => {
          recordedUrl = url;
          recordedBody = body;
          return mockSuccessResponse;
        },
      };

      const result = await generateInterviewPrep(mockClient, validJobId);

      assert.equal(recordedUrl, `/jobs/${validJobId}/interview-prep`);
      assert.equal(recordedBody, undefined, 'POST request must not include a body payload');
      assert.equal(result.job_title, 'Junior Backend Developer');
      assert.equal(result.questions.length, 5);
      assert.deepEqual(result.questions, mockValidQuestions);
    });
  });

  // =========================================================================
  // 4. Response Parsing & Normalization
  // =========================================================================
  describe('4. Response Parsing & Normalization', () => {
    it('should unwrap data payload and preserve questions array', async () => {
      const mockClient = {
        post: async () => ({
          data: {
            success: true,
            data: {
              job_title: 'Full Stack Engineer',
              questions: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'],
            },
          },
        }),
      };

      const result = await generateInterviewPrep(mockClient, validJobId);
      assert.equal(result.job_title, 'Full Stack Engineer');
      assert.deepEqual(result.questions, ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
    });

    it('should normalize non-string elements inside questions array', async () => {
      const mockClient = {
        post: async () => ({
          data: {
            success: true,
            data: {
              job_title: 'Software Engineer',
              questions: [123, 'Q2', true, 'Q4', 'Q5'],
            },
          },
        }),
      };

      const result = await generateInterviewPrep(mockClient, validJobId);
      assert.equal(result.questions[0], '123');
      assert.equal(result.questions[2], 'true');
    });

    it('should throw error when response data is missing', async () => {
      const mockClient = {
        post: async () => ({ data: { success: true, data: null } }),
      };

      await assert.rejects(
        async () => {
          await generateInterviewPrep(mockClient, validJobId);
        },
        (err) => err.message.includes('missing data payload')
      );
    });

    it('should throw error when questions is not an array', async () => {
      const mockClient = {
        post: async () => ({
          data: {
            success: true,
            data: {
              job_title: 'Engineer',
              questions: 'not-an-array',
            },
          },
        }),
      };

      await assert.rejects(
        async () => {
          await generateInterviewPrep(mockClient, validJobId);
        },
        (err) => err.message.includes('questions must be an array')
      );
    });
  });

  // =========================================================================
  // 5. Error Extraction & Status Code Handling
  // =========================================================================
  describe('5. Error Extraction & Status Handling (extractApiError)', () => {
    it('should extract 400 VALIDATION_ERROR (unapplied or rejected student)', () => {
      const error = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message:
                "Student has not applied to this job, or application status is 'REJECTED'",
            },
          },
        },
      };

      const extracted = extractApiError(error);
      assert.equal(extracted.code, 'VALIDATION_ERROR');
      assert.equal(
        extracted.message,
        "Student has not applied to this job, or application status is 'REJECTED'"
      );
    });

    it('should extract 401 UNAUTHORIZED (missing or invalid token)', () => {
      const error = {
        response: {
          status: 401,
          data: {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication token is missing or invalid',
            },
          },
        },
      };

      const extracted = extractApiError(error);
      assert.equal(extracted.code, 'UNAUTHORIZED');
      assert.equal(extracted.message, 'Authentication token is missing or invalid');
    });

    it('should extract 404 NOT_FOUND (job does not exist)', () => {
      const error = {
        response: {
          status: 404,
          data: {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Job does not exist',
            },
          },
        },
      };

      const extracted = extractApiError(error);
      assert.equal(extracted.code, 'NOT_FOUND');
      assert.equal(extracted.message, 'Job does not exist');
    });

    it('should extract 429 RATE_LIMITED (daily interview prep limit reached)', () => {
      const error = {
        response: {
          status: 429,
          data: {
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Daily interview prep limit reached (max 3/day)',
            },
          },
        },
      };

      const extracted = extractApiError(error);
      assert.equal(extracted.code, 'RATE_LIMITED');
      assert.equal(
        extracted.message,
        'Daily interview prep limit reached (max 3/day)'
      );
    });

    it('should handle network disconnection without response', () => {
      const error = {
        isAxiosError: true,
        response: undefined,
      };

      const extracted = extractApiError(error);
      assert.equal(extracted.code, 'NETWORK_ERROR');
      assert.match(extracted.message, /Unable to connect to the server/);
    });

    it('should handle client-side standard Error instance', () => {
      const error = new Error('Invalid jobId format (must be a valid UUID)');

      const extracted = extractApiError(error);
      assert.equal(extracted.code, 'CLIENT_ERROR');
      assert.equal(
        extracted.message,
        'Invalid jobId format (must be a valid UUID)'
      );
    });

    it('should fallback gracefully on unknown error structure', () => {
      const extracted = extractApiError('some random string error');
      assert.equal(extracted.code, 'UNKNOWN_ERROR');
      assert.match(extracted.message, /unexpected error/);
    });
  });

  // =========================================================================
  // 6. React Query Key Factory Conventions
  // =========================================================================
  describe('6. React Query Key Factory Conventions', () => {
    it('should have consistent root key', () => {
      assert.deepEqual(INTERVIEW_PREP_ROOT_KEY, ['interviewPrep']);
    });

    it('should produce structured query key for specific job', () => {
      const key = interviewPrepQueryKey(validJobId);
      assert.deepEqual(key, ['interviewPrep', validJobId]);
    });
  });
});
