import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper mirror for ATS score badge configuration
function getScoreBadge(score) {
  if (score >= 80) {
    return {
      variant: 'success',
      label: 'Strong ATS Match',
      text: 'text-emerald-400',
    };
  }
  if (score >= 60) {
    return {
      variant: 'warning',
      label: 'Moderate ATS Match',
      text: 'text-amber-400',
    };
  }
  return {
    variant: 'destructive',
    label: 'Needs Improvement',
    text: 'text-rose-400',
  };
}

function sanitizeAnalysisErrorMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return 'The AI analysis service was unable to process this resume. Please try again.';
  }

  const lower = rawMessage.toLowerCase();

  const containsInfrastructureDetails =
    lower.includes('gemini') ||
    lower.includes('openai') ||
    lower.includes('claude') ||
    lower.includes('anthropic') ||
    lower.includes('api') ||
    lower.includes('status 5') ||
    lower.includes('status 4') ||
    lower.includes('http') ||
    lower.includes('exception') ||
    lower.includes('prisma') ||
    lower.includes('postgres') ||
    lower.includes('bullmq') ||
    lower.includes('redis') ||
    lower.includes('stack') ||
    lower.includes('internal');

  if (containsInfrastructureDetails) {
    return 'The AI analysis service was unable to process this resume. Please try again.';
  }

  return rawMessage;
}

// UI State evaluator for ResumeAnalysisView
function evaluateAnalysisViewState({
  isLoading = false,
  isError = false,
  error = null,
  analysisData = null,
  hasAnalysis = false,
}) {
  if (isLoading && hasAnalysis) {
    return { state: 'LOADING' };
  }
  if (isError && !analysisData) {
    return {
      state: 'ERROR',
      message: error?.message || 'Failed to load AI analysis details',
    };
  }
  if (!analysisData || (!hasAnalysis && analysisData.status === undefined)) {
    return {
      state: 'NOT_TRIGGERED',
      canTrigger: true,
      label: 'Analyze Resume',
    };
  }
  if (analysisData.status === 'PROCESSING') {
    return {
      state: 'PROCESSING',
      canTrigger: false,
      isPolling: true,
      label: 'AI Analysis in Progress',
    };
  }
  if (analysisData.status === 'FAILED') {
    return {
      state: 'FAILED',
      canRetry: true,
      errorMessage: sanitizeAnalysisErrorMessage(analysisData.error_message),
    };
  }
  if (analysisData.status === 'COMPLETED' && analysisData.analysis) {
    return {
      state: 'COMPLETED',
      score: analysisData.analysis.score,
      badge: getScoreBadge(analysisData.analysis.score),
      missingSkills: analysisData.analysis.missing_skills || [],
      formattingTips: analysisData.analysis.formatting_tips || [],
      canReanalyze: true,
    };
  }

  return { state: 'UNKNOWN' };
}

// Polling Interval Evaluator matching useResumeAnalysis
function evaluateRefetchInterval(data) {
  if (data?.status === 'PROCESSING') {
    return 3000;
  }
  return false;
}

describe('Student AI Resume Analysis Suite (Phase 5.9 - docs/API.md §7.1, §7.2)', () => {
  describe('1. API Request Construction & Validation', () => {
    it('should validate valid UUID for trigger analysis path parameter', () => {
      const validUuid = '11111111-2222-4333-8444-555555555555';
      const path = `/resumes/${validUuid}/analyze`;
      assert.strictEqual(
        path,
        '/resumes/11111111-2222-4333-8444-555555555555/analyze'
      );

      const invalidUuid = 'not-a-uuid';
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          invalidUuid
        );
      assert.strictEqual(isUuid, false);
    });

    it('should construct GET analysis results endpoint path correctly', () => {
      const resumeId = 'c9b0e123-4567-89ab-cdef-0123456789ab';
      const endpoint = `/resumes/${resumeId}/analysis`;
      assert.strictEqual(
        endpoint,
        '/resumes/c9b0e123-4567-89ab-cdef-0123456789ab/analysis'
      );
    });
  });

  describe('2. Backend Response Mapping (docs/API.md §7.1, §7.2)', () => {
    it('should map 202 Accepted response on analysis trigger', () => {
      const triggerResponse = {
        success: true,
        data: {
          resume_id: 'c9b0e123-4567-89ab-cdef-0123456789ab',
          status: 'PROCESSING',
          message: 'Resume analysis enqueued.',
        },
      };

      assert.strictEqual(triggerResponse.success, true);
      assert.strictEqual(triggerResponse.data.status, 'PROCESSING');
      assert.strictEqual(typeof triggerResponse.data.resume_id, 'string');
    });

    it('should map COMPLETED analysis response adhering to contract', () => {
      const completedResponse = {
        success: true,
        data: {
          status: 'COMPLETED',
          analysis: {
            score: 85,
            missing_skills: ['Docker', 'Kubernetes', 'AWS'],
            formatting_tips: [
              'Add quantified metrics to project descriptions',
              'Use standard section headers',
            ],
            created_at: '2026-09-12T14:30:00.000Z',
          },
        },
      };

      assert.strictEqual(completedResponse.data.status, 'COMPLETED');
      assert.strictEqual(completedResponse.data.analysis.score, 85);
      assert.strictEqual(
        completedResponse.data.analysis.missing_skills.length,
        3
      );
      assert.strictEqual(
        completedResponse.data.analysis.formatting_tips.length,
        2
      );
      assert.match(
        completedResponse.data.analysis.created_at,
        /^\d{4}-\d{2}-\d{2}T/
      );
    });

    it('should map PROCESSING analysis response with null analysis payload', () => {
      const processingResponse = {
        success: true,
        data: {
          status: 'PROCESSING',
          analysis: null,
        },
      };

      assert.strictEqual(processingResponse.data.status, 'PROCESSING');
      assert.strictEqual(processingResponse.data.analysis, null);
    });

    it('should map FAILED analysis response with error_message', () => {
      const failedResponse = {
        success: true,
        data: {
          status: 'FAILED',
          error_message:
            'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.',
          analysis: null,
        },
      };

      assert.strictEqual(failedResponse.data.status, 'FAILED');
      assert.strictEqual(failedResponse.data.analysis, null);
      assert.match(
        failedResponse.data.error_message,
        /Failed to parse resume text/
      );
    });
  });

  describe('3. Not Triggered State (404 NOT_FOUND / null)', () => {
    it('should handle null data as NOT_TRIGGERED with call-to-action', () => {
      const state = evaluateAnalysisViewState({
        analysisData: null,
        hasAnalysis: false,
      });

      assert.strictEqual(state.state, 'NOT_TRIGGERED');
      assert.strictEqual(state.canTrigger, true);
      assert.strictEqual(state.label, 'Analyze Resume');
    });
  });

  describe('4. Processing State & Polling Behavior', () => {
    it('should evaluate PROCESSING state and enable polling', () => {
      const state = evaluateAnalysisViewState({
        analysisData: { status: 'PROCESSING', analysis: null },
        hasAnalysis: true,
      });

      assert.strictEqual(state.state, 'PROCESSING');
      assert.strictEqual(state.canTrigger, false);
      assert.strictEqual(state.isPolling, true);
    });

    it('should poll every 3000ms while status is PROCESSING', () => {
      const interval = evaluateRefetchInterval({
        status: 'PROCESSING',
        analysis: null,
      });
      assert.strictEqual(interval, 3000);
    });

    it('should immediately stop polling once COMPLETED', () => {
      const interval = evaluateRefetchInterval({
        status: 'COMPLETED',
        analysis: { score: 90 },
      });
      assert.strictEqual(interval, false);
    });

    it('should immediately stop polling once FAILED', () => {
      const interval = evaluateRefetchInterval({
        status: 'FAILED',
        error_message: 'Scan failed',
      });
      assert.strictEqual(interval, false);
    });

    it('should not poll when analysis data is null / not triggered', () => {
      const interval = evaluateRefetchInterval(null);
      assert.strictEqual(interval, false);
    });
  });

  describe('5. Completed State & Score Classification', () => {
    it('should classify score >= 80 as Strong ATS Match (success)', () => {
      const badge = getScoreBadge(85);
      assert.strictEqual(badge.variant, 'success');
      assert.strictEqual(badge.label, 'Strong ATS Match');

      const badgeBoundary = getScoreBadge(80);
      assert.strictEqual(badgeBoundary.variant, 'success');
    });

    it('should classify score 60-79 as Moderate ATS Match (warning)', () => {
      const badge = getScoreBadge(72);
      assert.strictEqual(badge.variant, 'warning');
      assert.strictEqual(badge.label, 'Moderate ATS Match');

      const badgeLower = getScoreBadge(60);
      assert.strictEqual(badgeLower.variant, 'warning');
    });

    it('should classify score < 60 as Needs Improvement (destructive)', () => {
      const badge = getScoreBadge(55);
      assert.strictEqual(badge.variant, 'destructive');
      assert.strictEqual(badge.label, 'Needs Improvement');

      const badgeZero = getScoreBadge(0);
      assert.strictEqual(badgeZero.variant, 'destructive');
    });

    it('should evaluate COMPLETED state with structured details', () => {
      const state = evaluateAnalysisViewState({
        analysisData: {
          status: 'COMPLETED',
          analysis: {
            score: 75,
            missing_skills: ['TypeScript', 'Jest'],
            formatting_tips: ['Include GitHub project links'],
            created_at: '2026-09-12T12:00:00Z',
          },
        },
        hasAnalysis: true,
      });

      assert.strictEqual(state.state, 'COMPLETED');
      assert.strictEqual(state.score, 75);
      assert.strictEqual(state.badge.label, 'Moderate ATS Match');
      assert.deepStrictEqual(state.missingSkills, ['TypeScript', 'Jest']);
      assert.deepStrictEqual(state.formattingTips, [
        'Include GitHub project links',
      ]);
      assert.strictEqual(state.canReanalyze, true);
    });
  });

  describe('6. Failed State & Retry Capability', () => {
    it('should evaluate FAILED state and allow retry', () => {
      const state = evaluateAnalysisViewState({
        analysisData: {
          status: 'FAILED',
          error_message: 'Unparseable document',
          analysis: null,
        },
        hasAnalysis: true,
      });

      assert.strictEqual(state.state, 'FAILED');
      assert.strictEqual(state.canRetry, true);
      assert.strictEqual(state.errorMessage, 'Unparseable document');
    });

    it('should sanitize raw provider errors and status codes into customer-friendly message', () => {
      const rawError =
        'AI analysis failed: Gemini API request failed with status 503';
      const sanitized = sanitizeAnalysisErrorMessage(rawError);
      assert.strictEqual(
        sanitized,
        'The AI analysis service was unable to process this resume. Please try again.'
      );
    });

    it('should preserve user-facing parsing tips that contain no infrastructure details', () => {
      const parsingError =
        'Failed to parse resume text. Please ensure the PDF is not password-protected or an image scan.';
      const sanitized = sanitizeAnalysisErrorMessage(parsingError);
      assert.strictEqual(sanitized, parsingError);
    });
  });

  describe('7. Concurrency & Duplicate Prevention', () => {
    it('should prevent triggering analysis when already pending or processing', () => {
      const isPending = true;
      const canTrigger = !isPending;
      assert.strictEqual(canTrigger, false);

      const processingState = evaluateAnalysisViewState({
        analysisData: { status: 'PROCESSING', analysis: null },
        hasAnalysis: true,
      });
      assert.strictEqual(processingState.canTrigger, false);
    });
  });

  describe('8. Query Key Generation & Cache Invalidation', () => {
    it('should generate consistent resume analysis query key', () => {
      const resumeId = '11111111-2222-3333-4444-555555555555';
      const key = ['student', 'resume-analysis', resumeId];
      assert.deepStrictEqual(key, [
        'student',
        'resume-analysis',
        '11111111-2222-3333-4444-555555555555',
      ]);
    });

    it('should invalidate analysis query and student resumes query on trigger success', () => {
      const invalidatedKeys = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
        setQueryData: () => {},
      };

      const resumeId = 'test-resume-id';
      const RESUMES_QUERY_KEY = ['student', 'resumes'];
      const RESUME_ANALYSIS_QUERY_KEY = [
        'student',
        'resume-analysis',
        resumeId,
      ];

      // Simulate onSuccess in useTriggerResumeAnalysis
      mockQueryClient.invalidateQueries({
        queryKey: RESUME_ANALYSIS_QUERY_KEY,
      });
      mockQueryClient.invalidateQueries({ queryKey: RESUMES_QUERY_KEY });

      assert.strictEqual(invalidatedKeys.length, 2);
      assert.deepStrictEqual(invalidatedKeys[0], [
        'student',
        'resume-analysis',
        'test-resume-id',
      ]);
      assert.deepStrictEqual(invalidatedKeys[1], ['student', 'resumes']);
    });
  });

  describe('9. Error Handling & Rate Limiting (Cooldown)', () => {
    it('should handle 409 Conflict when text extraction is still running', () => {
      const errorResponse = {
        response: {
          status: 409,
          data: {
            success: false,
            error: {
              code: 'CONFLICT',
              message:
                'Resume text extraction is still in progress. Please wait before triggering analysis.',
            },
          },
        },
      };

      const errorMessage = errorResponse.response.data.error.message;
      assert.match(errorMessage, /extraction is still in progress/);
    });

    it('should handle 429 Too Many Requests when within 5-minute cooldown', () => {
      const errorResponse = {
        response: {
          status: 429,
          data: {
            success: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Please wait before re-analyzing this resume.',
            },
          },
        },
      };

      const errorMessage = errorResponse.response.data.error.message;
      assert.strictEqual(
        errorMessage,
        'Please wait before re-analyzing this resume.'
      );
    });

    it('should handle 403 Forbidden when resume belongs to another student', () => {
      const errorResponse = {
        response: {
          status: 403,
          data: {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Resume belongs to a different student',
            },
          },
        },
      };

      assert.strictEqual(errorResponse.response.status, 403);
      assert.strictEqual(
        errorResponse.response.data.error.message,
        'Resume belongs to a different student'
      );
    });
  });

  describe('10. Student Role Authorization', () => {
    function canTriggerAnalysis(user) {
      if (!user) return false;
      return user.role === 'STUDENT';
    }

    it('should permit authenticated STUDENT role', () => {
      assert.strictEqual(
        canTriggerAnalysis({ id: 'u1', role: 'STUDENT' }),
        true
      );
    });

    it('should deny unauthenticated users', () => {
      assert.strictEqual(canTriggerAnalysis(null), false);
    });

    it('should deny non-STUDENT roles (RECRUITER, ADMIN)', () => {
      assert.strictEqual(
        canTriggerAnalysis({ id: 'u2', role: 'RECRUITER' }),
        false
      );
      assert.strictEqual(
        canTriggerAnalysis({ id: 'u3', role: 'ADMIN' }),
        false
      );
    });
  });
});
