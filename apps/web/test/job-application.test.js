import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyJobSchema } from '@careerforge/validation';

// Helper mirror of isValidUuid matching apps/web/src/features/jobs/jobsApi.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

// Logic helpers matching apps/web/src/features/jobs/components/JobApplyAction.tsx
function evaluateApplyActionState({
  isAuthenticated,
  role,
  hasApplied,
  resumes = [],
  isLoadingResumes = false,
  isPending = false,
}) {
  if (!isAuthenticated) {
    return {
      type: 'ANONYMOUS',
      canSubmit: false,
      buttonText: 'Sign In to Apply',
      loginPromptRequired: true,
    };
  }

  if (role !== 'STUDENT') {
    return {
      type: 'NON_STUDENT',
      canSubmit: false,
      message: `Job applications can only be submitted from verified Student accounts.`,
      actionHidden: true,
    };
  }

  if (hasApplied) {
    return {
      type: 'ALREADY_APPLIED',
      canSubmit: false,
      buttonText: 'Applied',
      badge: 'Applied',
      disabled: true,
    };
  }

  if (!isLoadingResumes && resumes.length === 0) {
    return {
      type: 'NO_RESUME',
      canSubmit: false,
      buttonText: 'Upload Resume',
      requiresResumeUpload: true,
    };
  }

  if (isPending) {
    return {
      type: 'SUBMITTING',
      canSubmit: false,
      buttonText: 'Submitting Application...',
      disabled: true,
      isLoading: true,
    };
  }

  const primaryResume = resumes.find((r) => r.is_primary) || resumes[0];

  return {
    type: 'CAN_APPLY',
    canSubmit: Boolean(primaryResume),
    buttonText: 'Apply Now',
    primaryResumeId: primaryResume?.id,
    disabled: !primaryResume,
  };
}

function mapApplyError(error) {
  const status = error.status || error.response?.status;
  const backendMessage =
    error.response?.data?.message || error.message || '';

  if (status === 409) {
    return {
      isApplied: true,
      errorMessage: 'You have already applied to this job posting.',
      isRetryable: false,
    };
  }

  if (status === 401) {
    return {
      isApplied: false,
      errorMessage:
        'Your session has expired. Please sign in again to submit your application.',
      isRetryable: false,
    };
  }

  if (status === 403) {
    return {
      isApplied: false,
      errorMessage:
        'Only authenticated students with valid resumes can apply for jobs.',
      isRetryable: false,
    };
  }

  if (status === 404) {
    if (backendMessage.toLowerCase().includes('resume')) {
      return {
        isApplied: false,
        errorMessage:
          'Your selected resume could not be found. Please upload a fresh resume.',
        isRetryable: false,
      };
    }
    return {
      isApplied: false,
      errorMessage:
        'This job posting is no longer available or does not exist.',
      isRetryable: false,
    };
  }

  if (status === 400) {
    return {
      isApplied: false,
      errorMessage:
        'This job posting is currently not accepting applications.',
      isRetryable: false,
    };
  }

  return {
    isApplied: false,
    errorMessage:
      'Unable to submit application. Please check your connection and try again.',
    isRetryable: true,
  };
}

describe('Student Job Application Submission Test Suite (Phase 5.6 - docs/API.md §8.1)', () => {
  describe('Backend Schema Validation (applyJobSchema)', () => {
    it('should validate valid UUID resume_id', () => {
      const validPayload = {
        resume_id: '7823f95e-141a-4d43-8ceb-bf6a666245e3',
      };
      const parsed = applyJobSchema.parse(validPayload);
      assert.deepEqual(parsed, validPayload);
    });

    it('should reject non-UUID resume_id', () => {
      assert.throws(
        () => applyJobSchema.parse({ resume_id: 'not-a-uuid' }),
        /Must be a valid UUID format/
      );
    });

    it('should reject empty or missing resume_id', () => {
      assert.throws(() => applyJobSchema.parse({}));
      assert.throws(() => applyJobSchema.parse({ resume_id: '' }));
    });

    it('should reject unexpected extra keys (strict schema)', () => {
      assert.throws(() =>
        applyJobSchema.parse({
          resume_id: '7823f95e-141a-4d43-8ceb-bf6a666245e3',
          extra_key: 'hacker_payload',
        })
      );
    });
  });

  describe('UI State Evaluation & Access Boundaries', () => {
    const validResume = {
      id: '7823f95e-141a-4d43-8ceb-bf6a666245e3',
      file_url: 'https://cloud.com/resume.pdf',
      is_primary: true,
      has_analysis: true,
      created_at: '2024-02-01T10:00:00.000Z',
    };

    it('1. Apply action shown for authenticated STUDENT with valid resume', () => {
      const state = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'STUDENT',
        hasApplied: false,
        resumes: [validResume],
      });

      assert.equal(state.type, 'CAN_APPLY');
      assert.equal(state.canSubmit, true);
      assert.equal(state.buttonText, 'Apply Now');
      assert.equal(state.primaryResumeId, validResume.id);
      assert.equal(state.disabled, false);
    });

    it('2. Apply action prompts login for anonymous visitor', () => {
      const state = evaluateApplyActionState({
        isAuthenticated: false,
        role: null,
        hasApplied: false,
      });

      assert.equal(state.type, 'ANONYMOUS');
      assert.equal(state.canSubmit, false);
      assert.equal(state.buttonText, 'Sign In to Apply');
      assert.equal(state.loginPromptRequired, true);
    });

    it('3. Apply action is withheld / disabled for RECRUITER or ADMIN', () => {
      const recruiterState = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'RECRUITER',
        hasApplied: false,
      });

      assert.equal(recruiterState.type, 'NON_STUDENT');
      assert.equal(recruiterState.canSubmit, false);
      assert.equal(recruiterState.actionHidden, true);

      const adminState = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'ADMIN',
        hasApplied: false,
      });

      assert.equal(adminState.type, 'NON_STUDENT');
      assert.equal(adminState.canSubmit, false);
      assert.equal(adminState.actionHidden, true);
    });

    it('4. Already-applied state disables application submission', () => {
      const state = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'STUDENT',
        hasApplied: true,
        resumes: [validResume],
      });

      assert.equal(state.type, 'ALREADY_APPLIED');
      assert.equal(state.canSubmit, false);
      assert.equal(state.buttonText, 'Applied');
      assert.equal(state.disabled, true);
    });

    it('5. Pending submission disables duplicate clicks and sets loading state', () => {
      const state = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'STUDENT',
        hasApplied: false,
        resumes: [validResume],
        isPending: true,
      });

      assert.equal(state.type, 'SUBMITTING');
      assert.equal(state.canSubmit, false);
      assert.equal(state.buttonText, 'Submitting Application...');
      assert.equal(state.disabled, true);
      assert.equal(state.isLoading, true);
    });

    it('6. Student without resumes is guided to upload a resume', () => {
      const state = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'STUDENT',
        hasApplied: false,
        resumes: [],
        isLoadingResumes: false,
      });

      assert.equal(state.type, 'NO_RESUME');
      assert.equal(state.canSubmit, false);
      assert.equal(state.buttonText, 'Upload Resume');
      assert.equal(state.requiresResumeUpload, true);
    });

    it('7. Successful mutation transitions UI state to Applied', () => {
      // Simulate successful mutation callback
      let localHasApplied = false;
      const onSuccess = () => {
        localHasApplied = true;
      };

      onSuccess();

      const postMutationState = evaluateApplyActionState({
        isAuthenticated: true,
        role: 'STUDENT',
        hasApplied: localHasApplied,
        resumes: [validResume],
      });

      assert.equal(postMutationState.type, 'ALREADY_APPLIED');
      assert.equal(postMutationState.buttonText, 'Applied');
      assert.equal(postMutationState.disabled, true);
    });
  });

  describe('Error Handling & Resilience', () => {
    it('8. 401 UNAUTHORIZED handling prompts session renewal', () => {
      const errorResult = mapApplyError({
        response: {
          status: 401,
          data: { code: 'UNAUTHORIZED', message: 'Missing token' },
        },
      });

      assert.equal(errorResult.isApplied, false);
      assert.match(errorResult.errorMessage, /session has expired/i);
      assert.equal(errorResult.isRetryable, false);
    });

    it('9. 409 CONFLICT handling gracefully maps to already-applied state', () => {
      const errorResult = mapApplyError({
        response: {
          status: 409,
          data: {
            code: 'CONFLICT',
            message: 'Student has already applied to this job',
          },
        },
      });

      assert.equal(errorResult.isApplied, true);
      assert.match(errorResult.errorMessage, /already applied/i);
      assert.equal(errorResult.isRetryable, false);
    });

    it('10. 400 VALIDATION_ERROR for inactive job posting shows clear status', () => {
      const errorResult = mapApplyError({
        response: {
          status: 400,
          data: {
            code: 'VALIDATION_ERROR',
            message: 'Job is not in ACTIVE status',
          },
        },
      });

      assert.equal(errorResult.isApplied, false);
      assert.match(errorResult.errorMessage, /not accepting applications/i);
      assert.equal(errorResult.isRetryable, false);
    });

    it('11. 404 NOT_FOUND distinguishes missing job from missing resume', () => {
      const jobNotFoundError = mapApplyError({
        response: {
          status: 404,
          data: { code: 'NOT_FOUND', message: 'Job does not exist' },
        },
      });
      assert.match(jobNotFoundError.errorMessage, /no longer available/i);

      const resumeNotFoundError = mapApplyError({
        response: {
          status: 404,
          data: { code: 'NOT_FOUND', message: 'Resume does not exist' },
        },
      });
      assert.match(resumeNotFoundError.errorMessage, /resume could not be found/i);
    });

    it('12. Network error allows retry', () => {
      const networkError = mapApplyError(new Error('Network Error'));
      assert.equal(networkError.isApplied, false);
      assert.match(networkError.errorMessage, /check your connection/i);
      assert.equal(networkError.isRetryable, true);
    });
  });

  describe('TanStack Query Cache Updater Logic', () => {
    it('13. sets has_applied: true in cached JobDetail object without mutating other fields', () => {
      const initialCachedJob = {
        id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        title: 'Junior Backend Developer',
        description: 'Full job description...',
        required_skills: ['Node.js', 'PostgreSQL'],
        employment_type: 'FULL_TIME',
        company: {
          id: 'comp-uuid',
          name: 'TechNova',
          logo_url: null,
        },
        has_applied: false,
        created_at: '2024-02-05T12:00:00.000Z',
      };

      // Simulates the cache updater function inside useApplyToJob onSuccess
      const updater = (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          has_applied: true,
        };
      };

      const updated = updater(initialCachedJob);
      assert.equal(updated.has_applied, true);
      assert.equal(updated.id, initialCachedJob.id);
      assert.equal(updated.title, initialCachedJob.title);
      assert.equal(updated.company.name, 'TechNova');
    });

    it('14. handles undefined cache safely', () => {
      const updater = (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, has_applied: true };
      };
      assert.equal(updater(undefined), undefined);
    });
  });
});
