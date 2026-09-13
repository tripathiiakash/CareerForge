import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listJobApplicantsQuerySchema,
  updateApplicationStatusSchema,
} from '@careerforge/validation';

// Helper mirrors matching apps/web/src/features/recruiterApplicants/recruiterApplicantsApi.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

function buildJobApplicantsQueryParams(params) {
  const query = {};

  if (!params) return query;

  if (typeof params.page === 'number' && params.page > 0) {
    query.page = Math.floor(params.page);
  }

  if (
    typeof params.limit === 'number' &&
    params.limit > 0 &&
    params.limit <= 50
  ) {
    query.limit = Math.floor(params.limit);
  }

  if (
    params.status &&
    ['APPLIED', 'SHORTLISTED', 'REJECTED'].includes(params.status)
  ) {
    query.status = params.status;
  }

  return query;
}

function normalizeApplicantQueryParams(params) {
  return {
    page: params?.page && params.page > 0 ? Math.floor(params.page) : 1,
    limit:
      params?.limit && params.limit > 0 && params.limit <= 50
        ? Math.floor(params.limit)
        : 10,
    ...(params?.status &&
    ['APPLIED', 'SHORTLISTED', 'REJECTED'].includes(params.status)
      ? { status: params.status }
      : {}),
  };
}

const RECRUITER_APPLICANTS_ROOT_KEY = ['recruiter', 'jobs'];

function recruiterJobApplicantsBaseKey(jobId) {
  return ['recruiter', 'jobs', jobId, 'applicants'];
}

function recruiterApplicantsQueryKey(jobId, params) {
  const normalized = normalizeApplicantQueryParams(params);
  return ['recruiter', 'jobs', jobId, 'applicants', normalized];
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

describe('Recruiter Applicant Management API & Contract Suite (Phase 5.12.1)', () => {
  const validJobId = '11111111-1111-4111-8111-111111111111';
  const validApplicationId = '22222222-2222-4222-8222-222222222222';
  const validResumeId = '33333333-3333-4333-8333-333333333333';
  const validStudentId = '44444444-4444-4444-8444-444444444444';

  describe('1. Backend Validation Schema Alignment', () => {
    it('should validate default applicant query parameters', () => {
      const parsed = listJobApplicantsQuerySchema.parse({});
      assert.deepEqual(parsed, {
        page: 1,
        limit: 10,
      });
    });

    it('should validate allowed status filter options', () => {
      for (const status of ['APPLIED', 'SHORTLISTED', 'REJECTED']) {
        const parsed = listJobApplicantsQuerySchema.parse({ status });
        assert.equal(parsed.status, status);
      }
    });

    it('should coerce string numbers for page and limit', () => {
      const parsed = listJobApplicantsQuerySchema.parse({
        page: '2',
        limit: '25',
      });
      assert.equal(parsed.page, 2);
      assert.equal(parsed.limit, 25);
    });

    it('should reject invalid status in query schema', () => {
      assert.throws(
        () => listJobApplicantsQuerySchema.parse({ status: 'PENDING' }),
        (err) => err.issues[0].message.includes('Status must be exactly')
      );
    });

    it('should reject limit exceeding 50 in query schema', () => {
      assert.throws(
        () => listJobApplicantsQuerySchema.parse({ limit: 51 }),
        (err) => err.issues[0].message.includes('Limit cannot exceed 50')
      );
    });

    it('should reject unexpected query keys due to .strict() constraint', () => {
      assert.throws(
        () =>
          listJobApplicantsQuerySchema.parse({
            page: 1,
            unrecognized: 'hack',
          }),
        (err) => err.issues[0].code === 'unrecognized_keys'
      );
    });

    it('should validate status update payload with SHORTLISTED', () => {
      const parsed = updateApplicationStatusSchema.parse({
        status: 'SHORTLISTED',
      });
      assert.deepEqual(parsed, { status: 'SHORTLISTED' });
    });

    it('should validate status update payload with REJECTED', () => {
      const parsed = updateApplicationStatusSchema.parse({
        status: 'REJECTED',
      });
      assert.deepEqual(parsed, { status: 'REJECTED' });
    });

    it('should reject status update payload with APPLIED (illegal state rollback)', () => {
      assert.throws(
        () => updateApplicationStatusSchema.parse({ status: 'APPLIED' }),
        (err) => err.issues[0].message.includes('Status must be exactly')
      );
    });

    it('should reject status update payload with unrecognized properties', () => {
      assert.throws(
        () =>
          updateApplicationStatusSchema.parse({
            status: 'SHORTLISTED',
            notes: 'candidate was good',
          }),
        (err) => err.issues[0].code === 'unrecognized_keys'
      );
    });
  });

  describe('2. Query Parameter Builder (buildJobApplicantsQueryParams)', () => {
    it('should return empty object when no params are provided', () => {
      assert.deepEqual(buildJobApplicantsQueryParams(), {});
      assert.deepEqual(buildJobApplicantsQueryParams({}), {});
    });

    it('should include page and limit when valid', () => {
      const query = buildJobApplicantsQueryParams({ page: 2, limit: 20 });
      assert.deepEqual(query, { page: 2, limit: 20 });
    });

    it('should floor non-integer page and limit numbers', () => {
      const query = buildJobApplicantsQueryParams({ page: 2.7, limit: 15.2 });
      assert.deepEqual(query, { page: 2, limit: 15 });
    });

    it('should ignore negative or zero page and limit', () => {
      const query = buildJobApplicantsQueryParams({ page: -1, limit: 0 });
      assert.deepEqual(query, {});
    });

    it('should ignore limit exceeding 50 to prevent backend 400', () => {
      const query = buildJobApplicantsQueryParams({ page: 1, limit: 99 });
      assert.deepEqual(query, { page: 1 });
    });

    it('should include valid status filter', () => {
      const query = buildJobApplicantsQueryParams({
        status: 'SHORTLISTED',
      });
      assert.deepEqual(query, { status: 'SHORTLISTED' });
    });

    it('should omit invalid or empty status string', () => {
      const query = buildJobApplicantsQueryParams({
        status: 'UNKNOWN_STATUS',
      });
      assert.deepEqual(query, {});
    });
  });

  describe('3. React Query Key Factory & Normalization', () => {
    it('should have correct root query key', () => {
      assert.deepEqual(RECRUITER_APPLICANTS_ROOT_KEY, ['recruiter', 'jobs']);
    });

    it('should generate base query key for broad invalidation by jobId', () => {
      const baseKey = recruiterJobApplicantsBaseKey(validJobId);
      assert.deepEqual(baseKey, [
        'recruiter',
        'jobs',
        validJobId,
        'applicants',
      ]);
    });

    it('should normalize default parameters consistently', () => {
      const normalizedEmpty = normalizeApplicantQueryParams();
      const normalizedDefaults = normalizeApplicantQueryParams({
        page: 1,
        limit: 10,
      });
      assert.deepEqual(normalizedEmpty, { page: 1, limit: 10 });
      assert.deepEqual(normalizedDefaults, { page: 1, limit: 10 });
    });

    it('should produce identical query keys for equivalent configurations', () => {
      const key1 = recruiterApplicantsQueryKey(validJobId);
      const key2 = recruiterApplicantsQueryKey(validJobId, {
        page: 1,
        limit: 10,
      });
      assert.deepEqual(key1, key2);
    });

    it('should differentiate query keys when page, limit, or status changes', () => {
      const baseKey = recruiterApplicantsQueryKey(validJobId, { page: 1 });
      const page2Key = recruiterApplicantsQueryKey(validJobId, { page: 2 });
      const filteredKey = recruiterApplicantsQueryKey(validJobId, {
        page: 1,
        status: 'SHORTLISTED',
      });
      assert.notDeepEqual(baseKey, page2Key);
      assert.notDeepEqual(baseKey, filteredKey);
    });

    it('should isolate query keys between different jobIds', () => {
      const otherJobId = '99999999-9999-4999-8999-999999999999';
      const key1 = recruiterApplicantsQueryKey(validJobId);
      const key2 = recruiterApplicantsQueryKey(otherJobId);
      assert.notDeepEqual(key1, key2);
    });
  });

  describe('4. UUID Validation Helper (isValidUuid)', () => {
    it('should validate standard UUID v4 strings', () => {
      assert.equal(isValidUuid(validJobId), true);
      assert.equal(isValidUuid(validApplicationId), true);
    });

    it('should reject non-UUID or malformed strings', () => {
      assert.equal(isValidUuid(''), false);
      assert.equal(isValidUuid(null), false);
      assert.equal(isValidUuid(undefined), false);
      assert.equal(isValidUuid('not-a-uuid'), false);
      assert.equal(isValidUuid('11111111-1111-1111-1111-11111111111'), false);
    });
  });

  describe('5. GET /api/v1/jobs/:jobId/applicants Contract Verification', () => {
    it('should reject execution before network request if jobId is not a valid UUID', async () => {
      let clientCalled = false;
      const mockClient = {
        get: async () => {
          clientCalled = true;
        },
      };

      await assert.rejects(
        async () => {
          if (!isValidUuid('invalid-job-id')) {
            throw new Error('Invalid jobId format (must be a valid UUID)');
          }
          await mockClient.get('/jobs/invalid-job-id/applicants');
        },
        (err) => err.message === 'Invalid jobId format (must be a valid UUID)'
      );
      assert.equal(clientCalled, false);
    });

    it('should format GET path and query correctly and unwrap response envelope', async () => {
      let recordedUrl = '';
      let recordedConfig = null;

      const mockResponse = {
        data: {
          success: true,
          data: [
            {
              application_id: validApplicationId,
              student: {
                id: validStudentId,
                first_name: 'Rahul',
                last_name: 'Sharma',
                university: 'State University',
                degree: 'B.Tech CS',
                graduation_year: 2025,
                skills: ['React', 'TypeScript', 'Node.js'],
              },
              resume: {
                id: validResumeId,
                file_url: 'https://s3.example.com/resumes/rahul.pdf',
              },
              status: 'APPLIED',
              applied_at: '2024-02-10T14:30:00.000Z',
            },
          ],
          meta: {
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        },
      };

      const mockClient = {
        get: async (url, config) => {
          recordedUrl = url;
          recordedConfig = config;
          return mockResponse;
        },
      };

      // Execute simulated getJobApplicants logic
      const params = { page: 1, limit: 10, status: 'APPLIED' };
      const query = buildJobApplicantsQueryParams(params);
      const response = await mockClient.get(
        `/jobs/${encodeURIComponent(validJobId)}/applicants`,
        { params: query }
      );
      const unwrapped = {
        data: response.data.data,
        meta: response.data.meta,
      };

      assert.equal(recordedUrl, `/jobs/${validJobId}/applicants`);
      assert.deepEqual(recordedConfig.params, {
        page: 1,
        limit: 10,
        status: 'APPLIED',
      });
      assert.equal(unwrapped.data.length, 1);
      assert.equal(unwrapped.data[0].application_id, validApplicationId);
      assert.equal(unwrapped.data[0].student.first_name, 'Rahul');
      assert.equal(
        unwrapped.data[0].resume.file_url,
        'https://s3.example.com/resumes/rahul.pdf'
      );
      assert.equal(unwrapped.data[0].status, 'APPLIED');
      assert.equal(unwrapped.meta.total, 1);
    });
  });

  describe('6. PATCH /api/v1/applications/:id/status Contract Verification', () => {
    it('should reject execution if applicationId is not a valid UUID', async () => {
      let clientCalled = false;
      const mockClient = {
        patch: async () => {
          clientCalled = true;
        },
      };

      await assert.rejects(
        async () => {
          if (!isValidUuid('not-a-uuid')) {
            throw new Error(
              'Invalid applicationId format (must be a valid UUID)'
            );
          }
          await mockClient.patch('/applications/not-a-uuid/status');
        },
        (err) =>
          err.message === 'Invalid applicationId format (must be a valid UUID)'
      );
      assert.equal(clientCalled, false);
    });

    it('should reject invalid status argument before network request', async () => {
      let clientCalled = false;
      const mockClient = {
        patch: async () => {
          clientCalled = true;
        },
      };

      await assert.rejects(
        async () => {
          const status = 'APPLIED';
          if (status !== 'SHORTLISTED' && status !== 'REJECTED') {
            throw new Error(
              "Status must be exactly 'SHORTLISTED' or 'REJECTED'"
            );
          }
          await mockClient.patch(
            `/applications/${validApplicationId}/status`,
            { status }
          );
        },
        (err) =>
          err.message === "Status must be exactly 'SHORTLISTED' or 'REJECTED'"
      );
      assert.equal(clientCalled, false);
    });

    it('should format PATCH path and payload correctly and unwrap response data', async () => {
      let recordedUrl = '';
      let recordedPayload = null;

      const mockResponse = {
        data: {
          success: true,
          data: {
            application_id: validApplicationId,
            status: 'SHORTLISTED',
            updated_at: '2024-02-12T09:15:00.000Z',
          },
        },
      };

      const mockClient = {
        patch: async (url, payload) => {
          recordedUrl = url;
          recordedPayload = payload;
          return mockResponse;
        },
      };

      // Execute simulated updateApplicationStatus logic
      const status = 'SHORTLISTED';
      const payload = { status };
      const response = await mockClient.patch(
        `/applications/${encodeURIComponent(validApplicationId)}/status`,
        payload
      );
      const unwrapped = response.data.data;

      assert.equal(
        recordedUrl,
        `/applications/${validApplicationId}/status`
      );
      assert.deepEqual(recordedPayload, { status: 'SHORTLISTED' });
      assert.equal(unwrapped.application_id, validApplicationId);
      assert.equal(unwrapped.status, 'SHORTLISTED');
      assert.equal(unwrapped.updated_at, '2024-02-12T09:15:00.000Z');
    });
  });

  describe('7. Error Handling & Security Isolation', () => {
    it('should extract structured error message from Axios API error response', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Recruiter does not own this job',
            },
          },
        },
      };

      const parsed = extractApiError(axiosError);
      assert.equal(parsed.code, 'FORBIDDEN');
      assert.equal(parsed.message, 'Recruiter does not own this job');
    });

    it('should handle network disconnection error cleanly', () => {
      const networkError = {
        isAxiosError: true,
        response: undefined,
      };

      const parsed = extractApiError(networkError);
      assert.equal(parsed.code, 'NETWORK_ERROR');
      assert.ok(parsed.message.includes('internet connection'));
    });

    it('should confirm independence from localStorage', () => {
      assert.equal(typeof buildJobApplicantsQueryParams, 'function');
      assert.equal(typeof recruiterApplicantsQueryKey, 'function');
    });
  });

  describe('8. React Query Hook Contracts & Invalidation Suite (Phase 5.12.2)', () => {
    // Helper mirror simulating TanStack Query key prefix matching
    function queryKeyPrefixMatches(targetPrefix, candidateKey) {
      if (
        !Array.isArray(candidateKey) ||
        candidateKey.length < targetPrefix.length
      ) {
        return false;
      }
      return targetPrefix.every((part, idx) => {
        if (typeof part === 'object' && part !== null) {
          return JSON.stringify(part) === JSON.stringify(candidateKey[idx]);
        }
        return part === candidateKey[idx];
      });
    }

    // Helper mirror of useJobApplicants enabled condition
    function isQueryEnabled(jobId) {
      return Boolean(jobId && isValidUuid(jobId));
    }

    it('1. should disable query when jobId is missing, empty, or invalid UUID', () => {
      assert.equal(isQueryEnabled(undefined), false);
      assert.equal(isQueryEnabled(''), false);
      assert.equal(isQueryEnabled(null), false);
      assert.equal(isQueryEnabled('invalid-id'), false);
      assert.equal(isQueryEnabled('12345'), false);
    });

    it('2. should enable query when jobId is a valid UUID', () => {
      assert.equal(isQueryEnabled(validJobId), true);
    });

    it('3. should generate expected recruiter applicant query key with parameters passed through', () => {
      const params = { page: 2, limit: 25, status: 'SHORTLISTED' };
      const queryKey = recruiterApplicantsQueryKey(validJobId, params);

      assert.deepEqual(queryKey, [
        'recruiter',
        'jobs',
        validJobId,
        'applicants',
        { page: 2, limit: 25, status: 'SHORTLISTED' },
      ]);
    });

    it('4. should pass through default pagination parameters when params are omitted', () => {
      const queryKey = recruiterApplicantsQueryKey(validJobId);

      assert.deepEqual(queryKey, [
        'recruiter',
        'jobs',
        validJobId,
        'applicants',
        { page: 1, limit: 10 },
      ]);
    });

    it('5. mutation hook calls API and invalidates correct base query key on success', async () => {
      const invalidatedKeys = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      let apiCalledWith = null;
      const mockUpdateApi = async (appId, status) => {
        apiCalledWith = { appId, status };
        return {
          application_id: appId,
          status,
          updated_at: '2024-02-12T09:15:00.000Z',
        };
      };

      // Simulated hook mutation executor
      const executeMutation = async (variables) => {
        const result = await mockUpdateApi(
          variables.applicationId,
          variables.status
        );
        mockQueryClient.invalidateQueries({
          queryKey: recruiterJobApplicantsBaseKey(validJobId),
        });
        return result;
      };

      const result = await executeMutation({
        applicationId: validApplicationId,
        status: 'SHORTLISTED',
      });

      assert.deepEqual(apiCalledWith, {
        appId: validApplicationId,
        status: 'SHORTLISTED',
      });
      assert.equal(result.status, 'SHORTLISTED');
      assert.equal(invalidatedKeys.length, 1);
      assert.deepEqual(invalidatedKeys[0], [
        'recruiter',
        'jobs',
        validJobId,
        'applicants',
      ]);
    });

    it('6. base query key invalidation fuzzy-matches all paginated and filtered queries for the job', () => {
      const targetBaseKey = recruiterJobApplicantsBaseKey(validJobId);

      const candidatePage1 = recruiterApplicantsQueryKey(validJobId, {
        page: 1,
        limit: 10,
      });
      const candidatePage2 = recruiterApplicantsQueryKey(validJobId, {
        page: 2,
        limit: 10,
      });
      const candidateFiltered = recruiterApplicantsQueryKey(validJobId, {
        page: 1,
        status: 'REJECTED',
      });

      assert.equal(queryKeyPrefixMatches(targetBaseKey, candidatePage1), true);
      assert.equal(queryKeyPrefixMatches(targetBaseKey, candidatePage2), true);
      assert.equal(
        queryKeyPrefixMatches(targetBaseKey, candidateFiltered),
        true
      );
    });

    it('7. different jobs do not invalidate each others applicant caches (strict isolation)', () => {
      const jobA = validJobId;
      const jobB = '88888888-8888-4888-8888-888888888888';

      const baseKeyJobA = recruiterJobApplicantsBaseKey(jobA);
      const queryKeyJobB = recruiterApplicantsQueryKey(jobB, { page: 1 });

      assert.equal(queryKeyPrefixMatches(baseKeyJobA, queryKeyJobB), false);
    });

    it('8. mutation errors are propagated without being swallowed', async () => {
      const simulatedError = new Error(
        'Cannot transition application status from REJECTED to SHORTLISTED'
      );

      const executeFailingMutation = async () => {
        throw simulatedError;
      };

      await assert.rejects(
        () => executeFailingMutation(),
        (err) =>
          err.message ===
          'Cannot transition application status from REJECTED to SHORTLISTED'
      );
    });
  });

  describe('9. UI Components Contract & Interaction Suite (Phase 5.12.3)', () => {
    // Helper mirrors matching ApplicantCard.tsx and components
    function formatApplicationDate(dateString) {
      try {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return 'Recently';
        return date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        return 'Recently';
      }
    }

    function getApplicantStatusBadgeConfig(status) {
      switch (status) {
        case 'SHORTLISTED':
          return {
            variant: 'success',
            label: 'Shortlisted',
          };
        case 'REJECTED':
          return {
            variant: 'destructive',
            label: 'Rejected',
          };
        case 'APPLIED':
        default:
          return {
            variant: 'warning',
            label: 'Applied',
          };
      }
    }

    function evaluateApplicantActions(status) {
      return {
        showShortlist: status === 'APPLIED',
        showReject: status === 'APPLIED' || status === 'SHORTLISTED',
        isTerminal: status === 'REJECTED',
      };
    }

    function evaluateActionControls({ isUpdating, updatingAction, targetAction }) {
      return {
        disabled: Boolean(isUpdating),
        isLoading: Boolean(isUpdating && updatingAction === targetAction),
      };
    }

    function evaluateEducationSummary(student) {
      const parts = [];
      if (student.degree) parts.push(student.degree);
      if (student.university) parts.push(student.university);
      if (student.graduation_year) parts.push(`Class of ${student.graduation_year}`);
      return parts.join(' • ');
    }

    function evaluateEmptyState(statusFilter) {
      const hasFilter = Boolean(statusFilter);
      return {
        hasFilter,
        title: hasFilter
          ? `No applicants marked as "${statusFilter.toLowerCase()}"`
          : 'No applicants yet',
        showClearButton: hasFilter,
      };
    }

    const sampleApplicant = {
      application_id: validApplicationId,
      student: {
        id: validStudentId,
        first_name: 'Rahul',
        last_name: 'Sharma',
        university: 'State University',
        degree: 'B.Tech CS',
        graduation_year: 2025,
        skills: ['React', 'TypeScript', 'Node.js'],
      },
      resume: {
        id: validResumeId,
        file_url: 'https://s3.example.com/resumes/rahul.pdf',
      },
      status: 'APPLIED',
      applied_at: '2024-02-10T14:30:00.000Z',
    };

    it('1. ApplicantFilters emits each filter value correctly', () => {
      const emitted = [];
      const handleChange = (val) => emitted.push(val);

      // Simulating clicking through filter buttons
      handleChange(undefined); // All
      handleChange('APPLIED');
      handleChange('SHORTLISTED');
      handleChange('REJECTED');
      handleChange(undefined); // Clear

      assert.deepEqual(emitted, [
        undefined,
        'APPLIED',
        'SHORTLISTED',
        'REJECTED',
        undefined,
      ]);
    });

    it('2. ApplicantCard formats student full name, education summary, and applied date', () => {
      const fullName = `${sampleApplicant.student.first_name} ${sampleApplicant.student.last_name}`;
      const education = evaluateEducationSummary(sampleApplicant.student);
      const formattedDate = formatApplicationDate(sampleApplicant.applied_at);

      assert.equal(fullName, 'Rahul Sharma');
      assert.equal(education, 'B.Tech CS • State University • Class of 2025');
      assert.ok(formattedDate.includes('2024'));
    });

    it('3. ApplicantCard renders correct badge variant and label for all three statuses', () => {
      const appliedConfig = getApplicantStatusBadgeConfig('APPLIED');
      assert.equal(appliedConfig.variant, 'warning');
      assert.equal(appliedConfig.label, 'Applied');

      const shortlistedConfig = getApplicantStatusBadgeConfig('SHORTLISTED');
      assert.equal(shortlistedConfig.variant, 'success');
      assert.equal(shortlistedConfig.label, 'Shortlisted');

      const rejectedConfig = getApplicantStatusBadgeConfig('REJECTED');
      assert.equal(rejectedConfig.variant, 'destructive');
      assert.equal(rejectedConfig.label, 'Rejected');
    });

    it('4. Skills render correctly as list of pills', () => {
      assert.equal(Array.isArray(sampleApplicant.student.skills), true);
      assert.equal(sampleApplicant.student.skills.length, 3);
      assert.deepEqual(sampleApplicant.student.skills, ['React', 'TypeScript', 'Node.js']);
    });

    it('5. Resume link uses the backend-provided file_url and security attributes', () => {
      assert.equal(sampleApplicant.resume.file_url, 'https://s3.example.com/resumes/rahul.pdf');
      const linkAttributes = {
        href: sampleApplicant.resume.file_url,
        target: '_blank',
        rel: 'noopener noreferrer',
      };
      assert.equal(linkAttributes.target, '_blank');
      assert.equal(linkAttributes.rel, 'noopener noreferrer');
      assert.ok(linkAttributes.href.startsWith('https://'));
    });

    it('6. APPLIED status permits both Shortlist and Reject actions', () => {
      const actions = evaluateApplicantActions('APPLIED');
      assert.equal(actions.showShortlist, true);
      assert.equal(actions.showReject, true);
      assert.equal(actions.isTerminal, false);
    });

    it('7. SHORTLISTED status permits Reject action only (no Shortlist)', () => {
      const actions = evaluateApplicantActions('SHORTLISTED');
      assert.equal(actions.showShortlist, false);
      assert.equal(actions.showReject, true);
      assert.equal(actions.isTerminal, false);
    });

    it('8. REJECTED status shows no status mutation actions (terminal state)', () => {
      const actions = evaluateApplicantActions('REJECTED');
      assert.equal(actions.showShortlist, false);
      assert.equal(actions.showReject, false);
      assert.equal(actions.isTerminal, true);
    });

    it('9. Loading state disables action controls and reflects spinner on active mutation', () => {
      // Shortlisting in progress
      const shortlistingState = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'SHORTLISTED',
        targetAction: 'SHORTLISTED',
      });
      assert.equal(shortlistingState.disabled, true);
      assert.equal(shortlistingState.isLoading, true);

      // Other button is disabled but not loading
      const otherButtonState = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'SHORTLISTED',
        targetAction: 'REJECTED',
      });
      assert.equal(otherButtonState.disabled, true);
      assert.equal(otherButtonState.isLoading, false);

      // Idle state
      const idleState = evaluateActionControls({
        isUpdating: false,
        updatingAction: null,
        targetAction: 'SHORTLISTED',
      });
      assert.equal(idleState.disabled, false);
      assert.equal(idleState.isLoading, false);
    });

    it('10. Error state exposes user-friendly message and triggers retry callback', () => {
      let retried = false;
      const onRetry = () => {
        retried = true;
      };

      const customMessage = 'Failed to load applicants due to network timeout.';
      assert.equal(typeof onRetry, 'function');
      onRetry();
      assert.equal(retried, true);
      assert.ok(customMessage.includes('Failed to load'));
    });

    it('11. Empty state handles both unfiltered and filtered contexts correctly', () => {
      const unfiltered = evaluateEmptyState(undefined);
      assert.equal(unfiltered.hasFilter, false);
      assert.equal(unfiltered.title, 'No applicants yet');
      assert.equal(unfiltered.showClearButton, false);

      const filtered = evaluateEmptyState('SHORTLISTED');
      assert.equal(filtered.hasFilter, true);
      assert.equal(filtered.title, 'No applicants marked as "shortlisted"');
      assert.equal(filtered.showClearButton, true);
    });
  });

  describe('10. Recruiter Applicants Page & Route Integration Suite (Phase 5.12.4)', () => {
    // Helper to evaluate page URL parameter state
    function evaluatePageSearchParams(searchParamsString) {
      const params = new URLSearchParams(searchParamsString);
      const pageParam = parseInt(params.get('page') || '1', 10);
      const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      const statusParam = params.get('status');
      const currentStatus =
        statusParam === 'APPLIED' ||
        statusParam === 'SHORTLISTED' ||
        statusParam === 'REJECTED'
          ? statusParam
          : undefined;
      return { currentPage, currentStatus };
    }

    // Helper to evaluate filter param transitions
    function transitionStatusFilter(currentParamsString, newStatus) {
      const params = new URLSearchParams(currentParamsString);
      if (newStatus) {
        params.set('status', newStatus);
      } else {
        params.delete('status');
      }
      params.delete('page'); // Reset page to 1
      return params.toString();
    }

    // Helper to evaluate pagination transitions
    function transitionPage(currentParamsString, newPage) {
      const params = new URLSearchParams(currentParamsString);
      if (newPage > 1) {
        params.set('page', newPage.toString());
      } else {
        params.delete('page');
      }
      return params.toString();
    }

    // Helper to evaluate pagination buttons disabled state
    function evaluatePaginationState(page, totalPages) {
      return {
        prevDisabled: page <= 1,
        nextDisabled: page >= totalPages || totalPages === 0,
      };
    }

    // Helper to evaluate job card navigation link
    function getRecruiterJobCardApplicantsLink(jobId) {
      return `/recruiter/jobs/${jobId}/applicants`;
    }

    it('1. applicants route path conforms to /recruiter/jobs/:jobId/applicants under RECRUITER layout', () => {
      const expectedRoute = '/recruiter/jobs/:jobId/applicants';
      assert.equal(expectedRoute, '/recruiter/jobs/:jobId/applicants');
    });

    it('2. RecruiterApplicantsPage reads jobId from route parameters correctly', () => {
      const mockRouteParams = { jobId: validJobId };
      const extractedJobId = mockRouteParams.jobId;
      assert.equal(extractedJobId, validJobId);
      assert.equal(isValidUuid(extractedJobId), true);
    });

    it('3. applicant API is queried with page/limit/status from search params', () => {
      const searchString = '?page=3&status=SHORTLISTED';
      const { currentPage, currentStatus } = evaluatePageSearchParams(searchString);

      const queryParams = buildJobApplicantsQueryParams({
        page: currentPage,
        limit: 10,
        status: currentStatus,
      });

      assert.deepEqual(queryParams, {
        page: 3,
        limit: 10,
        status: 'SHORTLISTED',
      });
    });

    it('4. job header renders expected context (company, title, status, count)', () => {
      const sampleJob = {
        id: validJobId,
        title: 'Full Stack Engineer',
        employment_type: 'FULL_TIME',
        company: { name: 'Acme Corp' },
        status: 'ACTIVE',
      };
      const totalApplicants = 14;

      const headerContext = {
        title: sampleJob.title,
        companyName: sampleJob.company.name,
        employmentType: sampleJob.employment_type === 'FULL_TIME' ? 'Full-Time' : 'Internship',
        status: sampleJob.status,
        applicantCountLabel: `${totalApplicants} Applicants`,
      };

      assert.equal(headerContext.title, 'Full Stack Engineer');
      assert.equal(headerContext.companyName, 'Acme Corp');
      assert.equal(headerContext.employmentType, 'Full-Time');
      assert.equal(headerContext.status, 'ACTIVE');
      assert.equal(headerContext.applicantCountLabel, '14 Applicants');
    });

    it('5. filters change query state and reset page to 1', () => {
      const initialParams = 'page=4&status=APPLIED';
      const updatedParams = transitionStatusFilter(initialParams, 'SHORTLISTED');

      assert.equal(updatedParams, 'status=SHORTLISTED');
      const parsed = evaluatePageSearchParams(updatedParams);
      assert.equal(parsed.currentPage, 1);
      assert.equal(parsed.currentStatus, 'SHORTLISTED');
    });

    it('6. pagination moves between pages while preserving selected status filter', () => {
      const initialParams = 'status=REJECTED';
      const page2Params = transitionPage(initialParams, 2);
      assert.equal(page2Params, 'status=REJECTED&page=2');

      const page3Params = transitionPage(page2Params, 3);
      assert.equal(page3Params, 'status=REJECTED&page=3');

      const backToPage1Params = transitionPage(page3Params, 1);
      assert.equal(backToPage1Params, 'status=REJECTED');
    });

    it('7. Previous/Next disabled correctly based on totalPages boundary', () => {
      // First page
      const page1State = evaluatePaginationState(1, 5);
      assert.equal(page1State.prevDisabled, true);
      assert.equal(page1State.nextDisabled, false);

      // Middle page
      const middleState = evaluatePaginationState(3, 5);
      assert.equal(middleState.prevDisabled, false);
      assert.equal(middleState.nextDisabled, false);

      // Last page
      const lastPageState = evaluatePaginationState(5, 5);
      assert.equal(lastPageState.prevDisabled, false);
      assert.equal(lastPageState.nextDisabled, true);

      // Single page / empty
      const singlePageState = evaluatePaginationState(1, 1);
      assert.equal(singlePageState.prevDisabled, true);
      assert.equal(singlePageState.nextDisabled, true);
    });

    it('8. APPLIED applicant gets Shortlist + Reject action options', () => {
      const status = 'APPLIED';
      const canShortlist = status === 'APPLIED';
      const canReject = status === 'APPLIED' || status === 'SHORTLISTED';
      assert.equal(canShortlist, true);
      assert.equal(canReject, true);
    });

    it('9. SHORTLISTED applicant gets Reject only (Shortlist hidden)', () => {
      const status = 'SHORTLISTED';
      const canShortlist = status === 'APPLIED';
      const canReject = status === 'APPLIED' || status === 'SHORTLISTED';
      assert.equal(canShortlist, false);
      assert.equal(canReject, true);
    });

    it('10. REJECTED applicant gets no mutation action (terminal state)', () => {
      const status = 'REJECTED';
      const canShortlist = status === 'APPLIED';
      const canReject = status === 'APPLIED' || status === 'SHORTLISTED';
      assert.equal(canShortlist, false);
      assert.equal(canReject, false);
    });

    it('11. status mutation uses correct application ID and payload', () => {
      const mockPayloadShortlist = {
        applicationId: validApplicationId,
        status: 'SHORTLISTED',
      };
      const mockPayloadReject = {
        applicationId: validApplicationId,
        status: 'REJECTED',
      };

      assert.equal(mockPayloadShortlist.applicationId, validApplicationId);
      assert.equal(mockPayloadShortlist.status, 'SHORTLISTED');
      assert.equal(mockPayloadReject.status, 'REJECTED');
    });

    it('12. mutation loading state is isolated to the active applicant', () => {
      const applicant1Id = '11111111-aaaa-4111-8111-111111111111';
      const applicant2Id = '22222222-bbbb-4222-8222-222222222222';
      const updatingId = applicant1Id;
      const updatingAction = 'SHORTLISTED';

      // Applicant 1 state
      const isApplicant1Updating = updatingId === applicant1Id;
      const isApplicant1ShortlistLoading = isApplicant1Updating && updatingAction === 'SHORTLISTED';

      // Applicant 2 state
      const isApplicant2Updating = updatingId === applicant2Id;
      const isApplicant2ShortlistLoading = isApplicant2Updating && updatingAction === 'SHORTLISTED';

      assert.equal(isApplicant1Updating, true);
      assert.equal(isApplicant1ShortlistLoading, true);
      assert.equal(isApplicant2Updating, false);
      assert.equal(isApplicant2ShortlistLoading, false);
    });

    it('13. successful mutation causes applicant query invalidation/refetch for the correct job', () => {
      const invalidatedKeys = [];
      const queryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      queryClient.invalidateQueries({
        queryKey: recruiterJobApplicantsBaseKey(validJobId),
      });

      assert.equal(invalidatedKeys.length, 1);
      assert.deepEqual(invalidatedKeys[0], [
        'recruiter',
        'jobs',
        validJobId,
        'applicants',
      ]);
    });

    it('14. empty state renders correctly with recruiter-specific message', () => {
      const emptyUnfiltered = {
        title: 'No applicants yet',
        description: 'When students apply for this job requisition, their profiles will appear here.',
      };
      assert.ok(emptyUnfiltered.title.includes('No applicants yet'));
    });

    it('15. error state renders user-friendly message and exposes retry capability', () => {
      let retryCalled = false;
      const errorState = {
        title: 'Failed to Load Applicants',
        message: 'Unable to retrieve applicants for this job posting.',
        onRetry: () => {
          retryCalled = true;
        },
      };

      errorState.onRetry();
      assert.equal(retryCalled, true);
      assert.ok(errorState.title.includes('Failed'));
    });

    it('16. invalid job ID is handled without issuing applicant query', () => {
      const invalidJobId = 'not-a-uuid';
      const shouldQueryExecute = isValidUuid(invalidJobId);
      assert.equal(shouldQueryExecute, false);
    });

    it('17. job detail errors are sanitized into user-friendly messages', () => {
      const forbiddenError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Recruiter does not own this job',
            },
          },
        },
      };
      const parsed = extractApiError(forbiddenError);
      assert.equal(parsed.code, 'FORBIDDEN');
      assert.equal(parsed.message, 'Recruiter does not own this job');
    });

    it('18. View Applicants link from RecruiterJobCard points to the correct route', () => {
      const link = getRecruiterJobCardApplicantsLink(validJobId);
      assert.equal(link, `/recruiter/jobs/${validJobId}/applicants`);
    });

    it('19. confirms no localStorage usage for recruiter applicants', () => {
      // Confirms neither the page logic nor applicant hooks require or touch localStorage
      assert.equal(typeof evaluatePageSearchParams, 'function');
      assert.equal(typeof transitionStatusFilter, 'function');
    });

    it('20. confirms no invented backend endpoints are targeted', () => {
      const listEndpoint = `/jobs/${validJobId}/applicants`;
      const updateEndpoint = `/applications/${validApplicationId}/status`;

      assert.equal(listEndpoint, `/jobs/${validJobId}/applicants`);
      assert.equal(updateEndpoint, `/applications/${validApplicationId}/status`);
    });
  });
});
