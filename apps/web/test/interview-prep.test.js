import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve directory for source file inspection
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const featuresDir = path.resolve(__dirname, '../src/features/interviewPrep');
const componentsDir = path.resolve(featuresDir, 'components');

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

// Simulated hook executor matching apps/web/src/features/interviewPrep/hooks.ts
function createSimulatedMutationHook(jobId, mockQueryClient, mockApiFn) {
  let state = {
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  };

  const mutateAsync = async (overrideJobId) => {
    const targetJobId = overrideJobId || jobId;
    if (!targetJobId) {
      const err = new Error('Invalid jobId format (must be a valid UUID)');
      state = {
        isPending: false,
        isSuccess: false,
        isError: true,
        data: undefined,
        error: err,
      };
      throw err;
    }

    state = {
      isPending: true,
      isSuccess: false,
      isError: false,
      data: undefined,
      error: null,
    };

    try {
      const data = await mockApiFn(targetJobId);
      if (mockQueryClient?.setQueryData) {
        mockQueryClient.setQueryData(interviewPrepQueryKey(targetJobId), data);
      }
      state = {
        isPending: false,
        isSuccess: true,
        isError: false,
        data,
        error: null,
      };
      return data;
    } catch (err) {
      state = {
        isPending: false,
        isSuccess: false,
        isError: true,
        data: undefined,
        error: err,
      };
      throw err;
    }
  };

  const mutate = (overrideJobId, callbacks) => {
    mutateAsync(overrideJobId)
      .then((data) => callbacks?.onSuccess?.(data))
      .catch((err) => callbacks?.onError?.(err));
  };

  return {
    get isPending() {
      return state.isPending;
    },
    get isSuccess() {
      return state.isSuccess;
    },
    get isError() {
      return state.isError;
    },
    get data() {
      return state.data;
    },
    get error() {
      return state.error;
    },
    mutate,
    mutateAsync,
  };
}

// Pure helper mirror for mapInterviewPrepError matching InterviewPrepError.tsx
const TECHNICAL_ERROR_PATTERNS = [
  /prisma/i,
  /select\s+/i,
  /insert\s+/i,
  /database/i,
  /postgres/i,
  /econnrefused/i,
  /internal\s+server\s+error/i,
  /stack\s+trace/i,
  /syntaxerror/i,
  /typeerror/i,
  /uncaught/i,
  /column/i,
  /relation/i,
  /table/i,
  /500/i,
  /jwt/i,
  /bearer/i,
  /gemini/i,
  /openai/i,
];

function mapInterviewPrepError(error) {
  const extracted = extractApiError(error);
  const code = extracted.code;
  const rawMessage = (extracted.message || '').trim();

  if (code === 'RATE_LIMITED' || rawMessage.toLowerCase().includes('max 3')) {
    return {
      title: 'Daily Limit Reached',
      message:
        'You have reached your limit of 3 interview preparation sessions for today. Please check back tomorrow (UTC) to generate new practice questions.',
      isRateLimited: true,
      canRetry: false,
    };
  }

  if (
    code === 'VALIDATION_ERROR' ||
    rawMessage.toLowerCase().includes('not applied') ||
    rawMessage.toLowerCase().includes('rejected')
  ) {
    return {
      title: 'Application Required',
      message:
        'AI Interview Preparation is only available for jobs where you have an active application in APPLIED or SHORTLISTED status.',
      isRateLimited: false,
      canRetry: false,
    };
  }

  if (code === 'UNAUTHORIZED' || rawMessage.toLowerCase().includes('unauthorized')) {
    return {
      title: 'Sign In Required',
      message:
        'Your session has expired or you are not signed in. Please sign in with your student account to access interview preparation.',
      isRateLimited: false,
      canRetry: false,
    };
  }

  if (code === 'NOT_FOUND' || rawMessage.toLowerCase().includes('not found')) {
    return {
      title: 'Job Unavailable',
      message:
        'This job posting is no longer active or could not be found. Interview preparation questions can only be generated for active listings.',
      isRateLimited: false,
      canRetry: false,
    };
  }

  if (code === 'NETWORK_ERROR') {
    return {
      title: 'Connection Issue',
      message:
        'Unable to connect to CareerForge. Please check your internet connection and try again.',
      isRateLimited: false,
      canRetry: true,
    };
  }

  const hasLeakage = TECHNICAL_ERROR_PATTERNS.some((pattern) =>
    pattern.test(rawMessage)
  );

  const safeMessage =
    hasLeakage || !rawMessage
      ? 'We were unable to generate your interview questions at this time. Please try again in a few moments.'
      : rawMessage;

  return {
    title: 'Generation Failed',
    message: safeMessage,
    isRateLimited: false,
    canRetry: true,
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

    it('should have hooks.ts created with useGenerateInterviewPrep', () => {
      const hooksFile = path.join(featuresDir, 'hooks.ts');
      assert.equal(fs.existsSync(hooksFile), true, 'hooks.ts must exist');

      const content = fs.readFileSync(hooksFile, 'utf8');
      assert.match(content, /export function useGenerateInterviewPrep/);
      assert.match(content, /useMutation/);
      assert.match(content, /useQueryClient/);
      assert.match(content, /generateInterviewPrep/);
      assert.match(content, /interviewPrepQueryKey/);
    });

    it('should have index.ts barrel re-exporting types, API client, hooks, and components', () => {
      const indexFile = path.join(featuresDir, 'index.ts');
      assert.equal(fs.existsSync(indexFile), true, 'index.ts must exist');

      const content = fs.readFileSync(indexFile, 'utf8');
      assert.match(content, /export \* from '\.\/types'/);
      assert.match(content, /export \* from '\.\/interviewPrepApi'/);
      assert.match(content, /export \* from '\.\/hooks'/);
      assert.match(content, /export \* from '\.\/components'/);
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

  // =========================================================================
  // 7. React Query Mutation Hook (useGenerateInterviewPrep)
  // =========================================================================
  describe('7. React Query Mutation Hook (useGenerateInterviewPrep)', () => {
    it('should execute mutation and call generateInterviewPrep with correct jobId', async () => {
      let calledWithJobId = null;
      const mockApiFn = async (id) => {
        calledWithJobId = id;
        return {
          job_title: 'Junior Backend Developer',
          questions: mockValidQuestions,
        };
      };

      const hook = createSimulatedMutationHook(validJobId, null, mockApiFn);
      const result = await hook.mutateAsync();

      assert.equal(calledWithJobId, validJobId);
      assert.equal(result.job_title, 'Junior Backend Developer');
      assert.equal(result.questions.length, 5);
    });

    it('should track pending, success, and data state transitions', async () => {
      let resolvePromise;
      const deferredPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockApiFn = async () => {
        return deferredPromise;
      };

      const hook = createSimulatedMutationHook(validJobId, null, mockApiFn);

      assert.equal(hook.isPending, false);
      assert.equal(hook.isSuccess, false);
      assert.equal(hook.isError, false);
      assert.equal(hook.data, undefined);

      const executionPromise = hook.mutateAsync();
      assert.equal(hook.isPending, true);

      resolvePromise({
        job_title: 'Frontend Engineer',
        questions: mockValidQuestions,
      });

      const result = await executionPromise;
      assert.equal(hook.isPending, false);
      assert.equal(hook.isSuccess, true);
      assert.equal(hook.isError, false);
      assert.equal(hook.data.job_title, 'Frontend Engineer');
      assert.equal(result.job_title, 'Frontend Engineer');
    });

    it('should update query cache with setQueryData under interviewPrepQueryKey', async () => {
      const cacheUpdates = new Map();
      const mockQueryClient = {
        setQueryData: (key, data) => {
          cacheUpdates.set(JSON.stringify(key), data);
        },
      };

      const mockApiFn = async () => ({
        job_title: 'DevOps Specialist',
        questions: mockValidQuestions,
      });

      const hook = createSimulatedMutationHook(validJobId, mockQueryClient, mockApiFn);
      await hook.mutateAsync();

      const expectedKeyStr = JSON.stringify(interviewPrepQueryKey(validJobId));
      assert.equal(cacheUpdates.has(expectedKeyStr), true);
      assert.equal(cacheUpdates.get(expectedKeyStr).job_title, 'DevOps Specialist');
    });

    it('should allow overriding or supplying jobId at mutate execution time', async () => {
      const otherJobId = '22222222-2222-4222-8222-222222222222';
      let calledJobId = null;

      const mockApiFn = async (id) => {
        calledJobId = id;
        return {
          job_title: 'Overridden Job Title',
          questions: mockValidQuestions,
        };
      };

      // Hook initialized without default jobId
      const hook = createSimulatedMutationHook(undefined, null, mockApiFn);
      await hook.mutateAsync(otherJobId);

      assert.equal(calledJobId, otherJobId);
      assert.equal(hook.data.job_title, 'Overridden Job Title');
    });

    it('should propagate API error and transition to isError with RATE_LIMITED', async () => {
      const rateLimitError = {
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

      const mockApiFn = async () => {
        throw rateLimitError;
      };

      const hook = createSimulatedMutationHook(validJobId, null, mockApiFn);

      await assert.rejects(
        async () => {
          await hook.mutateAsync();
        },
        (err) => err === rateLimitError
      );

      assert.equal(hook.isPending, false);
      assert.equal(hook.isSuccess, false);
      assert.equal(hook.isError, true);
      assert.equal(hook.error, rateLimitError);

      const extracted = extractApiError(hook.error);
      assert.equal(extracted.code, 'RATE_LIMITED');
      assert.equal(extracted.message, 'Daily interview prep limit reached (max 3/day)');
    });

    it('should reject immediately if jobId is omitted at both initialization and execution time', async () => {
      const hook = createSimulatedMutationHook(undefined, null, async () => {});

      await assert.rejects(
        async () => {
          await hook.mutateAsync();
        },
        (err) => err.message === 'Invalid jobId format (must be a valid UUID)'
      );

      assert.equal(hook.isError, true);
      assert.equal(hook.error.message, 'Invalid jobId format (must be a valid UUID)');
    });
  });

  // =========================================================================
  // 8. Interview Preparation UI Components (Phase 5.16.3)
  // =========================================================================
  describe('8. Interview Preparation UI Components (Phase 5.16.3)', () => {
    it('1. should have all component files present with correct exports', () => {
      const expectedFiles = [
        'InterviewPrepCard.tsx',
        'InterviewPrepIdle.tsx',
        'InterviewPrepLoading.tsx',
        'InterviewPrepQuestions.tsx',
        'InterviewPrepError.tsx',
        'index.ts',
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(componentsDir, file);
        assert.equal(fs.existsSync(filePath), true, `Component file ${file} must exist`);
      }

      const indexContent = fs.readFileSync(path.join(componentsDir, 'index.ts'), 'utf8');
      assert.ok(indexContent.includes("export * from './InterviewPrepCard'"));
      assert.ok(indexContent.includes("export * from './InterviewPrepIdle'"));
      assert.ok(indexContent.includes("export * from './InterviewPrepLoading'"));
      assert.ok(indexContent.includes("export * from './InterviewPrepQuestions'"));
      assert.ok(indexContent.includes("export * from './InterviewPrepError'"));
    });

    // --- InterviewPrepIdle Tests ---
    it('2. InterviewPrepIdle articulates tailored AI practice and states 3 calls/day quota', () => {
      const idleFile = path.join(componentsDir, 'InterviewPrepIdle.tsx');
      const content = fs.readFileSync(idleFile, 'utf8');

      assert.ok(content.includes('InterviewPrepIdleProps'));
      assert.ok(content.includes('data-testid="interview-prep-idle"'));
      assert.ok(content.includes('data-testid="interview-prep-generate-button"'));
      assert.ok(content.includes('Generate Interview Questions'));
      assert.ok(content.includes('Maximum 3 interview preparation sessions per student per day'));
      assert.ok(content.includes('Sparkles'));
      assert.ok(content.includes('<h3'));
    });

    // --- InterviewPrepLoading Tests ---
    it('3. InterviewPrepLoading includes accessible role="status" and simulates 5 skeleton items', () => {
      const loadingFile = path.join(componentsDir, 'InterviewPrepLoading.tsx');
      const content = fs.readFileSync(loadingFile, 'utf8');

      assert.ok(content.includes('InterviewPrepLoadingProps'));
      assert.ok(content.includes('role="status"'));
      assert.ok(content.includes('aria-label="Generating interview questions"'));
      assert.ok(content.includes('data-testid="interview-prep-loading"'));
      assert.ok(content.includes('data-testid="interview-prep-question-skeleton"'));
      assert.ok(content.includes('length: 5'));
      assert.ok(content.includes('Loader2'));
      assert.ok(content.includes('AI Generating'));
    });

    // --- InterviewPrepQuestions Tests ---
    it('4. InterviewPrepQuestions renders job title, 5 questions in ordered list, and footer tips', () => {
      const questionsFile = path.join(componentsDir, 'InterviewPrepQuestions.tsx');
      const content = fs.readFileSync(questionsFile, 'utf8');

      assert.ok(content.includes('InterviewPrepQuestionsProps'));
      assert.ok(content.includes('data-testid="interview-prep-questions"'));
      assert.ok(content.includes('data-testid="interview-prep-job-title"'));
      assert.ok(content.includes('data-testid="interview-prep-questions-list"'));
      assert.ok(content.includes('interview-prep-question-item-'));
      assert.ok(content.includes('data-testid="interview-prep-regenerate-button"'));
      assert.ok(content.includes('STAR method'));
      assert.ok(content.includes('Max 3 calls/day'));
      assert.ok(content.includes('AI Tailored'));
    });

    // --- Error Mapping & InterviewPrepError Tests ---
    it('5. mapInterviewPrepError properly formats 400 VALIDATION_ERROR without retry', () => {
      const error400 = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: "Student has not applied to this job, or application status is 'REJECTED'",
            },
          },
        },
      };

      const mapped = mapInterviewPrepError(error400);
      assert.equal(mapped.title, 'Application Required');
      assert.equal(mapped.isRateLimited, false);
      assert.equal(mapped.canRetry, false);
      assert.ok(mapped.message.includes('APPLIED or SHORTLISTED status'));
    });

    it('6. mapInterviewPrepError properly formats 401 UNAUTHORIZED without retry', () => {
      const error401 = {
        response: {
          status: 401,
          data: {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Token missing' },
          },
        },
      };

      const mapped = mapInterviewPrepError(error401);
      assert.equal(mapped.title, 'Sign In Required');
      assert.equal(mapped.isRateLimited, false);
      assert.equal(mapped.canRetry, false);
      assert.ok(mapped.message.includes('sign in with your student account'));
    });

    it('7. mapInterviewPrepError properly formats 404 NOT_FOUND without retry', () => {
      const error404 = {
        response: {
          status: 404,
          data: {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Job does not exist' },
          },
        },
      };

      const mapped = mapInterviewPrepError(error404);
      assert.equal(mapped.title, 'Job Unavailable');
      assert.equal(mapped.isRateLimited, false);
      assert.equal(mapped.canRetry, false);
      assert.ok(mapped.message.includes('active listings'));
    });

    it('8. mapInterviewPrepError properly formats 429 RATE_LIMITED without auto-retry', () => {
      const error429 = {
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

      const mapped = mapInterviewPrepError(error429);
      assert.equal(mapped.title, 'Daily Limit Reached');
      assert.equal(mapped.isRateLimited, true);
      assert.equal(mapped.canRetry, false);
      assert.ok(mapped.message.includes('limit of 3 interview preparation sessions'));
    });

    it('9. mapInterviewPrepError allows retry on network or generic server failure', () => {
      const networkErr = {
        isAxiosError: true,
        response: undefined,
      };

      const mappedNetwork = mapInterviewPrepError(networkErr);
      assert.equal(mappedNetwork.title, 'Connection Issue');
      assert.equal(mappedNetwork.canRetry, true);
      assert.equal(mappedNetwork.isRateLimited, false);

      const serverErr = {
        response: {
          status: 500,
          data: {
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Gemini API status 503' },
          },
        },
      };

      const mappedServer = mapInterviewPrepError(serverErr);
      assert.equal(mappedServer.title, 'Generation Failed');
      assert.equal(mappedServer.canRetry, true);
      assert.equal(mappedServer.isRateLimited, false);
      assert.ok(!mappedServer.message.includes('Gemini'));
      assert.ok(!mappedServer.message.includes('503'));
    });

    it('10. InterviewPrepError component renders data-testid and handles retry action', () => {
      const errorFile = path.join(componentsDir, 'InterviewPrepError.tsx');
      const content = fs.readFileSync(errorFile, 'utf8');

      assert.ok(content.includes('InterviewPrepErrorProps'));
      assert.ok(content.includes('data-testid="interview-prep-error"'));
      assert.ok(content.includes('data-testid="interview-prep-error-message"'));
      assert.ok(content.includes('data-testid="interview-prep-retry-button"'));
      assert.ok(content.includes('canRetry && onRetry'));
      assert.ok(content.includes('RotateCcw'));
      assert.ok(content.includes('mapInterviewPrepError'));
    });

    // --- InterviewPrepCard Container Tests ---
    it('11. InterviewPrepCard orchestrates idle, loading, error, and success states cleanly', () => {
      const cardFile = path.join(componentsDir, 'InterviewPrepCard.tsx');
      const content = fs.readFileSync(cardFile, 'utf8');

      assert.ok(content.includes('useGenerateInterviewPrep'));
      assert.ok(content.includes('<InterviewPrepLoading'));
      assert.ok(content.includes('<InterviewPrepError'));
      assert.ok(content.includes('<InterviewPrepQuestions'));
      assert.ok(content.includes('<InterviewPrepIdle'));
      assert.ok(content.includes('mutation.isPending'));
      assert.ok(content.includes('mutation.isError'));
      assert.ok(content.includes('currentData'));
      assert.ok(content.includes('initialData'));
    });

    // --- Boundaries & Accessibility Tests ---
    it('12. Component files do not use localStorage, sessionStorage, or inline script injections', () => {
      const files = fs.readdirSync(componentsDir);
      for (const file of files) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf8');
        assert.equal(content.includes('localStorage'), false, `${file} must not use localStorage`);
        assert.equal(content.includes('sessionStorage'), false, `${file} must not use sessionStorage`);
        assert.equal(content.includes('dangerouslySetInnerHTML'), false, `${file} must not use dangerouslySetInnerHTML`);
      }
    });
  });
});
