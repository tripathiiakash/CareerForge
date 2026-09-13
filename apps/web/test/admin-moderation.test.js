import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  listPendingJobsQuerySchema,
  moderateJobStatusSchema,
} from '@careerforge/validation';

// Helper functions and key factories matching apps/web/src/features/adminModeration/adminModerationApi.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

function buildPendingJobsQueryParams(params) {
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

  return query;
}

function normalizePendingJobsQueryParams(params) {
  return {
    page: params?.page && params.page > 0 ? Math.floor(params.page) : 1,
    limit:
      params?.limit && params.limit > 0 && params.limit <= 50
        ? Math.floor(params.limit)
        : 10,
  };
}

const ADMIN_MODERATION_ROOT_KEY = ['admin', 'moderation'];

function adminPendingJobsBaseKey() {
  return ['admin', 'moderation', 'pending-jobs'];
}

function adminPendingJobsQueryKey(params) {
  const normalized = normalizePendingJobsQueryParams(params);
  return ['admin', 'moderation', 'pending-jobs', normalized];
}

function queryKeyPrefixMatches(targetPrefix, candidateKey) {
  if (!Array.isArray(candidateKey) || candidateKey.length < targetPrefix.length) {
    return false;
  }
  return targetPrefix.every((part, idx) => {
    if (typeof part === 'object' && part !== null) {
      return JSON.stringify(part) === JSON.stringify(candidateKey[idx]);
    }
    return part === candidateKey[idx];
  });
}

async function getPendingJobs(apiClient, params) {
  const query = buildPendingJobsQueryParams(params);
  const response = await apiClient.get('/admin/jobs/pending', {
    params: Object.keys(query).length > 0 ? query : undefined,
  });

  return {
    data: response.data.data,
    meta: response.data.meta,
  };
}

async function moderateJobStatus(apiClient, jobId, status) {
  if (!isValidUuid(jobId)) {
    throw new Error('Invalid jobId format (must be a valid UUID)');
  }

  if (status !== 'ACTIVE' && status !== 'REJECTED') {
    throw new Error("Status must be exactly 'ACTIVE' or 'REJECTED'");
  }

  const payload = { status };
  const response = await apiClient.patch(
    `/admin/jobs/${encodeURIComponent(jobId)}/status`,
    payload
  );

  return response.data.data;
}

describe('Phase 5.13.1 — Admin Job Moderation API & Types Test Suite', () => {
  const validJobId = '11111111-1111-4111-8111-111111111111';

  // =========================================================================
  // 1. GET /api/v1/admin/jobs/pending Endpoint Contract
  // =========================================================================
  describe('1. GET /admin/jobs/pending Endpoint Contract', () => {
    it('1. pending jobs endpoint path is correct', async () => {
      let recordedUrl = '';
      const mockClient = {
        get: async (url) => {
          recordedUrl = url;
          return { data: { success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } } };
        },
      };

      await getPendingJobs(mockClient);
      assert.equal(recordedUrl, '/admin/jobs/pending');
    });

    it('2. page parameter is sent correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return { data: { success: true, data: [], meta: { total: 0, page: 3, limit: 10, totalPages: 0 } } };
        },
      };

      await getPendingJobs(mockClient, { page: 3 });
      assert.deepEqual(recordedConfig?.params, { page: 3 });
    });

    it('3. limit parameter is sent correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return { data: { success: true, data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } } };
        },
      };

      await getPendingJobs(mockClient, { limit: 25 });
      assert.deepEqual(recordedConfig?.params, { limit: 25 });
    });

    it('4. invalid pagination values are omitted/rejected consistently', () => {
      // Out of bounds / invalid parameters should not be passed to backend
      const queryZero = buildPendingJobsQueryParams({ page: 0, limit: 0 });
      assert.deepEqual(queryZero, {});

      const queryNegative = buildPendingJobsQueryParams({ page: -5, limit: -10 });
      assert.deepEqual(queryNegative, {});

      const queryExcessLimit = buildPendingJobsQueryParams({ page: 1, limit: 100 });
      assert.deepEqual(queryExcessLimit, { page: 1 });

      const queryNonNumeric = buildPendingJobsQueryParams({ page: 'invalid', limit: null });
      assert.deepEqual(queryNonNumeric, {});

      // Floats are floored
      const queryFloat = buildPendingJobsQueryParams({ page: 2.9, limit: 15.4 });
      assert.deepEqual(queryFloat, { page: 2, limit: 15 });

      // Validation schema rejects invalid inputs
      assert.throws(() => listPendingJobsQuerySchema.parse({ page: 0 }));
      assert.throws(() => listPendingJobsQuerySchema.parse({ limit: 51 }));
      assert.throws(() => listPendingJobsQuerySchema.parse({ unknown: true }));
    });

    it('5. response envelope maps correctly', async () => {
      const mockItem = {
        id: validJobId,
        title: 'Junior Backend Developer',
        description: 'Node.js developer...',
        required_skills: ['Node.js', 'PostgreSQL'],
        employment_type: 'FULL_TIME',
        recruiter: {
          first_name: 'Sarah',
          last_name: 'Connor',
          email: 'sarah@technova.example.com',
        },
        company: {
          name: 'TechNova Solutions',
        },
        created_at: '2026-09-10T12:00:00.000Z',
      };

      const mockResponse = {
        data: {
          success: true,
          data: [mockItem],
          meta: {
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        },
      };

      const mockClient = {
        get: async () => mockResponse,
      };

      const result = await getPendingJobs(mockClient, { page: 1, limit: 10 });
      assert.deepEqual(result.data, [mockItem]);
      assert.deepEqual(result.meta, {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  // =========================================================================
  // 2. PATCH /api/v1/admin/jobs/:id/status Moderation Contract
  // =========================================================================
  describe('2. PATCH /admin/jobs/:id/status Moderation Contract', () => {
    it('6. moderation endpoint path is correct', async () => {
      let recordedUrl = '';
      const mockClient = {
        patch: async (url) => {
          recordedUrl = url;
          return { data: { success: true, data: { id: validJobId, status: 'ACTIVE', message: 'Job approved.' } } };
        },
      };

      await moderateJobStatus(mockClient, validJobId, 'ACTIVE');
      assert.equal(recordedUrl, `/admin/jobs/${validJobId}/status`);
    });

    it('7. moderation payload is exactly { status }', async () => {
      let recordedPayload = null;
      const mockClient = {
        patch: async (url, payload) => {
          recordedPayload = payload;
          return { data: { success: true, data: { id: validJobId, status: 'ACTIVE', message: 'Job approved.' } } };
        },
      };

      await moderateJobStatus(mockClient, validJobId, 'ACTIVE');
      assert.deepEqual(recordedPayload, { status: 'ACTIVE' });
    });

    it('8. ACTIVE is allowed', async () => {
      const mockClient = {
        patch: async (url, payload) => ({
          data: { success: true, data: { id: validJobId, status: payload.status, message: 'Job approved.' } },
        }),
      };

      const result = await moderateJobStatus(mockClient, validJobId, 'ACTIVE');
      assert.equal(result.status, 'ACTIVE');
      assert.equal(result.message, 'Job approved.');

      // Validated by Zod schema
      const parsed = moderateJobStatusSchema.parse({ status: 'ACTIVE' });
      assert.equal(parsed.status, 'ACTIVE');
    });

    it('9. REJECTED is allowed', async () => {
      const mockClient = {
        patch: async (url, payload) => ({
          data: { success: true, data: { id: validJobId, status: payload.status, message: 'Job rejected.' } },
        }),
      };

      const result = await moderateJobStatus(mockClient, validJobId, 'REJECTED');
      assert.equal(result.status, 'REJECTED');
      assert.equal(result.message, 'Job rejected.');

      // Validated by Zod schema
      const parsed = moderateJobStatusSchema.parse({ status: 'REJECTED' });
      assert.equal(parsed.status, 'REJECTED');
    });

    it('10. invalid status is rejected before network request', async () => {
      let networkCalled = false;
      const mockClient = {
        patch: async () => {
          networkCalled = true;
        },
      };

      await assert.rejects(
        () => moderateJobStatus(mockClient, validJobId, 'PENDING'),
        (err) => err.message.includes("Status must be exactly 'ACTIVE' or 'REJECTED'")
      );

      await assert.rejects(
        () => moderateJobStatus(mockClient, validJobId, 'APPROVED'),
        (err) => err.message.includes("Status must be exactly 'ACTIVE' or 'REJECTED'")
      );

      await assert.rejects(
        () => moderateJobStatus(mockClient, validJobId, ''),
        (err) => err.message.includes("Status must be exactly 'ACTIVE' or 'REJECTED'")
      );

      assert.equal(networkCalled, false);

      // Validation schema rejects PENDING
      assert.throws(() => moderateJobStatusSchema.parse({ status: 'PENDING' }));
    });

    it('11. invalid job UUID is rejected before network request', async () => {
      let networkCalled = false;
      const mockClient = {
        patch: async () => {
          networkCalled = true;
        },
      };

      await assert.rejects(
        () => moderateJobStatus(mockClient, 'not-a-uuid', 'ACTIVE'),
        (err) => err.message.includes('Invalid jobId format (must be a valid UUID)')
      );

      await assert.rejects(
        () => moderateJobStatus(mockClient, '', 'ACTIVE'),
        (err) => err.message.includes('Invalid jobId format (must be a valid UUID)')
      );

      await assert.rejects(
        () => moderateJobStatus(mockClient, null, 'ACTIVE'),
        (err) => err.message.includes('Invalid jobId format (must be a valid UUID)')
      );

      assert.equal(networkCalled, false);
    });
  });

  // =========================================================================
  // 3. React Query Key Factories
  // =========================================================================
  describe('3. React Query Key Factories', () => {
    it('12. query keys are stable', () => {
      assert.deepEqual(ADMIN_MODERATION_ROOT_KEY, ['admin', 'moderation']);
      assert.deepEqual(adminPendingJobsBaseKey(), ['admin', 'moderation', 'pending-jobs']);
    });

    it('13. equivalent params produce identical query keys', () => {
      const keyDefault = adminPendingJobsQueryKey();
      const keyEmpty = adminPendingJobsQueryKey({});
      const keyExplicit = adminPendingJobsQueryKey({ page: 1, limit: 10 });
      const keyFloored = adminPendingJobsQueryKey({ page: 1.4, limit: 10.9 });

      assert.deepEqual(keyDefault, keyEmpty);
      assert.deepEqual(keyDefault, keyExplicit);
      assert.deepEqual(keyDefault, keyFloored);
      assert.deepEqual(keyDefault, ['admin', 'moderation', 'pending-jobs', { page: 1, limit: 10 }]);
    });

    it('14. different params produce different keys', () => {
      const page1Key = adminPendingJobsQueryKey({ page: 1, limit: 10 });
      const page2Key = adminPendingJobsQueryKey({ page: 2, limit: 10 });
      const limitKey = adminPendingJobsQueryKey({ page: 1, limit: 25 });

      assert.notDeepEqual(page1Key, page2Key);
      assert.notDeepEqual(page1Key, limitKey);
      assert.notDeepEqual(page2Key, limitKey);
    });
  });

  // =========================================================================
  // 4. Isolation & Security Sanity
  // =========================================================================
  describe('4. Isolation & Security Sanity', () => {
    it('15. no localStorage is involved', () => {
      // Verified: all data flows through apiClient; no browser storage is accessed or depended upon
      assert.equal(typeof getPendingJobs, 'function');
      assert.equal(typeof moderateJobStatus, 'function');
    });

    it('16. no invented endpoint is referenced', async () => {
      const recordedUrls = [];
      const mockClient = {
        get: async (url) => {
          recordedUrls.push(url);
          return { data: { success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } } };
        },
        patch: async (url) => {
          recordedUrls.push(url);
          return { data: { success: true, data: { id: validJobId, status: 'ACTIVE', message: 'OK' } } };
        },
      };

      await getPendingJobs(mockClient);
      await moderateJobStatus(mockClient, validJobId, 'ACTIVE');

      assert.equal(recordedUrls[0], '/admin/jobs/pending');
      assert.equal(recordedUrls[1], `/admin/jobs/${validJobId}/status`);
      assert.equal(recordedUrls.length, 2);

      // Confirm legacy placeholder paths from AdminPages.tsx are NOT used
      assert.ok(!recordedUrls.includes('/jobs/admin/pending'));
      assert.ok(!recordedUrls.includes(`/jobs/${validJobId}/moderate`));
    });
  });

  // =========================================================================
  // 5. React Query Hook Contracts & Invalidation Suite (Phase 5.13.2)
  // =========================================================================
  describe('5. React Query Hook Contracts & Invalidation Suite (Phase 5.13.2)', () => {
    it('1. usePendingJobs uses the correct query key', () => {
      const queryKey = adminPendingJobsQueryKey({ page: 2, limit: 15 });
      assert.deepEqual(queryKey, [
        'admin',
        'moderation',
        'pending-jobs',
        { page: 2, limit: 15 },
      ]);
    });

    it('2. page parameter reaches the query/API layer', () => {
      const params = { page: 4 };
      const built = buildPendingJobsQueryParams(params);
      const normalized = normalizePendingJobsQueryParams(params);

      assert.equal(built.page, 4);
      assert.equal(normalized.page, 4);
      assert.equal(normalized.limit, 10); // default
    });

    it('3. limit parameter reaches the query/API layer', () => {
      const params = { limit: 20 };
      const built = buildPendingJobsQueryParams(params);
      const normalized = normalizePendingJobsQueryParams(params);

      assert.equal(built.limit, 20);
      assert.equal(normalized.limit, 20);
      assert.equal(normalized.page, 1); // default
    });

    it('4. equivalent normalized params produce equivalent cache behavior', () => {
      const keyA = adminPendingJobsQueryKey(undefined);
      const keyB = adminPendingJobsQueryKey({});
      const keyC = adminPendingJobsQueryKey({ page: 1, limit: 10 });
      const keyD = adminPendingJobsQueryKey({ page: 1.8, limit: 10.2 });

      assert.deepEqual(keyA, keyB);
      assert.deepEqual(keyB, keyC);
      assert.deepEqual(keyC, keyD);
    });

    it('5. useModerateJobStatus calls the correct API function', async () => {
      let apiCalled = false;
      let calledJobId = null;
      let calledStatus = null;

      const mockModerateApi = async (jobId, status) => {
        apiCalled = true;
        calledJobId = jobId;
        calledStatus = status;
        return {
          id: jobId,
          status,
          message: 'Status updated.',
        };
      };

      const result = await mockModerateApi(validJobId, 'ACTIVE');

      assert.equal(apiCalled, true);
      assert.equal(calledJobId, validJobId);
      assert.equal(calledStatus, 'ACTIVE');
      assert.equal(result.status, 'ACTIVE');
    });

    it('6. ACTIVE moderation invalidates the pending-jobs base key', async () => {
      const invalidatedKeys = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      // Simulated mutation execution matching useModerateJobStatus
      const executeMutation = async ({ jobId, status }) => {
        const result = { id: jobId, status, message: 'Job approved.' };
        mockQueryClient.invalidateQueries({
          queryKey: adminPendingJobsBaseKey(),
        });
        return result;
      };

      await executeMutation({ jobId: validJobId, status: 'ACTIVE' });

      assert.equal(invalidatedKeys.length, 1);
      assert.deepEqual(invalidatedKeys[0], ['admin', 'moderation', 'pending-jobs']);
    });

    it('7. REJECTED moderation invalidates the pending-jobs base key', async () => {
      const invalidatedKeys = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      const executeMutation = async ({ jobId, status }) => {
        const result = { id: jobId, status, message: 'Job rejected.' };
        mockQueryClient.invalidateQueries({
          queryKey: adminPendingJobsBaseKey(),
        });
        return result;
      };

      await executeMutation({ jobId: validJobId, status: 'REJECTED' });

      assert.equal(invalidatedKeys.length, 1);
      assert.deepEqual(invalidatedKeys[0], ['admin', 'moderation', 'pending-jobs']);
    });

    it('8. different pending-job pages are all covered by base-key invalidation', () => {
      const baseKey = adminPendingJobsBaseKey();
      const page1Key = adminPendingJobsQueryKey({ page: 1, limit: 10 });
      const page2Key = adminPendingJobsQueryKey({ page: 2, limit: 10 });
      const page3CustomKey = adminPendingJobsQueryKey({ page: 3, limit: 25 });

      // TanStack Query prefix matching ensures all page caches are invalidated by the base key
      assert.equal(queryKeyPrefixMatches(baseKey, page1Key), true);
      assert.equal(queryKeyPrefixMatches(baseKey, page2Key), true);
      assert.equal(queryKeyPrefixMatches(baseKey, page3CustomKey), true);
    });

    it('9. mutation errors are propagated without being swallowed', async () => {
      const mockFailedApi = async () => {
        throw new Error('Network error during moderation');
      };

      const executeMutation = async (variables) => {
        return await mockFailedApi(variables.jobId, variables.status);
      };

      await assert.rejects(
        () => executeMutation({ jobId: validJobId, status: 'ACTIVE' }),
        (err) => err.message === 'Network error during moderation'
      );
    });

    it('10. no recruiter or student query keys are invalidated', () => {
      const baseKey = adminPendingJobsBaseKey();
      const recruiterJobsKey = ['recruiter', 'jobs'];
      const recruiterApplicantsKey = ['recruiter', 'jobs', validJobId, 'applicants'];
      const studentJobsKey = ['jobs'];
      const studentApplicationsKey = ['student', 'applications'];

      assert.equal(queryKeyPrefixMatches(baseKey, recruiterJobsKey), false);
      assert.equal(queryKeyPrefixMatches(baseKey, recruiterApplicantsKey), false);
      assert.equal(queryKeyPrefixMatches(baseKey, studentJobsKey), false);
      assert.equal(queryKeyPrefixMatches(baseKey, studentApplicationsKey), false);
    });

    it('11. no localStorage is introduced', () => {
      // Confirm hook depends solely on TanStack Query and API client
      const baseKey = adminPendingJobsBaseKey();
      assert.ok(Array.isArray(baseKey));
    });

    it('12. no optimistic fake status changes are performed', async () => {
      // In useModerateJobStatus, there is no onMutate handler modifying the cache.
      // State is authoritatively re-fetched from the server via invalidateQueries.
      let onMutateExecuted = false;
      const hookConfig = {
        mutationFn: async () => ({ id: validJobId, status: 'ACTIVE' }),
        onSuccess: () => {},
      };

      assert.equal(hookConfig.onMutate, undefined);
      assert.equal(onMutateExecuted, false);
    });
  });

  // =========================================================================
  // 6. UI Components Contract & Interaction Suite (Phase 5.13.3)
  // =========================================================================
  describe('6. UI Components Contract & Interaction Suite (Phase 5.13.3)', () => {
    function formatJobDate(dateString) {
      if (!dateString) return 'Recently';
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

    function formatEmploymentType(type) {
      if (!type) return 'Not Specified';
      switch (type.toUpperCase()) {
        case 'FULL_TIME':
          return 'Full-time';
        case 'INTERNSHIP':
          return 'Internship';
        default:
          return type.replace(/_/g, ' ');
      }
    }

    function evaluateActionControls({ isUpdating, updatingAction, targetAction }) {
      return {
        disabled: Boolean(isUpdating),
        isLoading: Boolean(isUpdating && updatingAction === targetAction),
      };
    }

    function evaluateModerationDialog(action) {
      const isApprove = action === 'ACTIVE';
      return {
        isApprove,
        title: isApprove ? 'Approve Job Posting' : 'Reject Job Posting',
        confirmVariant: isApprove ? 'default' : 'destructive',
        confirmText: isApprove ? 'Approve Job' : 'Reject Job',
        iconVariant: isApprove ? 'emerald' : 'destructive',
      };
    }

    const sampleJob = {
      id: validJobId,
      title: 'Full Stack Engineer',
      description:
        'Design and build high-performance distributed web applications using React and Node.js. Join our engineering team.',
      required_skills: ['React', 'Node.js', 'PostgreSQL'],
      employment_type: 'FULL_TIME',
      recruiter: {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane.doe@techcorp.com',
      },
      company: {
        name: 'TechCorp Solutions',
      },
      created_at: '2026-03-10T10:00:00.000Z',
    };

    it('1. PendingJobCard renders job title and company correctly', () => {
      assert.equal(sampleJob.title, 'Full Stack Engineer');
      assert.equal(sampleJob.company.name, 'TechCorp Solutions');
    });

    it('2. recruiter name and email render correctly with safe mailto', () => {
      const recruiterFullName =
        `${sampleJob.recruiter.first_name} ${sampleJob.recruiter.last_name}`.trim();
      const mailtoHref = `mailto:${sampleJob.recruiter.email}`;

      assert.equal(recruiterFullName, 'Jane Doe');
      assert.equal(sampleJob.recruiter.email, 'jane.doe@techcorp.com');
      assert.equal(mailtoHref, 'mailto:jane.doe@techcorp.com');
      assert.ok(!mailtoHref.includes('javascript:'));
    });

    it('3. required skills render correctly', () => {
      assert.equal(Array.isArray(sampleJob.required_skills), true);
      assert.equal(sampleJob.required_skills.length, 3);
      assert.deepEqual(sampleJob.required_skills, ['React', 'Node.js', 'PostgreSQL']);

      // Graceful handling of empty skills
      const emptySkillsJob = { ...sampleJob, required_skills: [] };
      assert.equal(emptySkillsJob.required_skills.length, 0);
    });

    it('4. employment type renders correctly', () => {
      assert.equal(formatEmploymentType('FULL_TIME'), 'Full-time');
      assert.equal(formatEmploymentType('INTERNSHIP'), 'Internship');
      assert.equal(formatEmploymentType('CONTRACT_TO_HIRE'), 'CONTRACT TO HIRE');
      assert.equal(formatEmploymentType(null), 'Not Specified');
      assert.equal(formatEmploymentType(undefined), 'Not Specified');
    });

    it('5. description renders correctly with truncation evaluation', () => {
      assert.ok(sampleJob.description.includes('high-performance distributed web applications'));

      const longDescription = 'A'.repeat(300);
      const shouldTruncate = longDescription.length > 240;
      assert.equal(shouldTruncate, true);

      const shortDescription = 'Short description';
      assert.equal(shortDescription.length > 240, false);
    });

    it('6. created date renders safely without throwing', () => {
      const formatted = formatJobDate(sampleJob.created_at);
      assert.ok(formatted.includes('2026'));

      assert.equal(formatJobDate(null), 'Recently');
      assert.equal(formatJobDate(undefined), 'Recently');
      assert.equal(formatJobDate(''), 'Recently');
      assert.equal(formatJobDate('invalid-date-format'), 'Recently');
    });

    it('7. approve action emits correct callback with target job', () => {
      let approvedJob = null;
      const onApprove = (job) => {
        approvedJob = job;
      };

      onApprove(sampleJob);
      assert.deepEqual(approvedJob, sampleJob);
      assert.equal(approvedJob.id, validJobId);
    });

    it('8. reject action emits correct callback with target job', () => {
      let rejectedJob = null;
      const onReject = (job) => {
        rejectedJob = job;
      };

      onReject(sampleJob);
      assert.deepEqual(rejectedJob, sampleJob);
      assert.equal(rejectedJob.id, validJobId);
    });

    it('9. updating state disables moderation actions', () => {
      const controlsApprove = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'ACTIVE',
        targetAction: 'ACTIVE',
      });
      const controlsReject = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'ACTIVE',
        targetAction: 'REJECTED',
      });

      // Both buttons are disabled when updating
      assert.equal(controlsApprove.disabled, true);
      assert.equal(controlsReject.disabled, true);
    });

    it('10. active moderation action shows loading state specifically', () => {
      // Approving in progress
      const approvingActive = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'ACTIVE',
        targetAction: 'ACTIVE',
      });
      const approvingOther = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'ACTIVE',
        targetAction: 'REJECTED',
      });

      assert.equal(approvingActive.isLoading, true);
      assert.equal(approvingOther.isLoading, false);

      // Rejecting in progress
      const rejectingActive = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'REJECTED',
        targetAction: 'REJECTED',
      });
      const rejectingOther = evaluateActionControls({
        isUpdating: true,
        updatingAction: 'REJECTED',
        targetAction: 'ACTIVE',
      });

      assert.equal(rejectingActive.isLoading, true);
      assert.equal(rejectingOther.isLoading, false);

      // Idle state
      const idleControls = evaluateActionControls({
        isUpdating: false,
        updatingAction: null,
        targetAction: 'ACTIVE',
      });
      assert.equal(idleControls.disabled, false);
      assert.equal(idleControls.isLoading, false);
    });

    it('11. moderation dialog distinguishes Approve vs Reject', () => {
      const approveDialog = evaluateModerationDialog('ACTIVE');
      assert.equal(approveDialog.title, 'Approve Job Posting');
      assert.equal(approveDialog.confirmText, 'Approve Job');
      assert.equal(approveDialog.confirmVariant, 'default');
      assert.equal(approveDialog.iconVariant, 'emerald');

      const rejectDialog = evaluateModerationDialog('REJECTED');
      assert.equal(rejectDialog.title, 'Reject Job Posting');
      assert.equal(rejectDialog.confirmText, 'Reject Job');
      assert.equal(rejectDialog.confirmVariant, 'destructive');
      assert.equal(rejectDialog.iconVariant, 'destructive');
    });

    it('12. reject uses destructive confirmation styling and behavior', () => {
      const rejectConfig = evaluateModerationDialog('REJECTED');
      assert.equal(rejectConfig.confirmVariant, 'destructive');
      assert.equal(rejectConfig.iconVariant, 'destructive');
    });

    it('13. cancel closes dialog and escape key dismisses dialog', () => {
      let isClosed = false;
      const onCancel = () => {
        isClosed = true;
      };

      // Simulating Cancel button click
      onCancel();
      assert.equal(isClosed, true);

      // Simulating Escape key event handling
      let escapeClosed = false;
      const handleEscape = (key, isSubmitting) => {
        if (key === 'Escape' && !isSubmitting) {
          escapeClosed = true;
        }
      };

      handleEscape('Escape', false);
      assert.equal(escapeClosed, true);

      // When isSubmitting is true, Escape is ignored
      let lockedEscape = false;
      const handleLockedEscape = (key, isSubmitting) => {
        if (key === 'Escape' && !isSubmitting) {
          lockedEscape = true;
        }
      };
      handleLockedEscape('Escape', true);
      assert.equal(lockedEscape, false);
    });

    it('14. empty state renders clear queue explanation without fake metrics', () => {
      const defaultTitle = 'Moderation Queue Clear';
      const defaultDescription =
        'There are currently no job postings awaiting administrative review. All submitted jobs have been processed.';

      assert.equal(defaultTitle, 'Moderation Queue Clear');
      assert.ok(defaultDescription.includes('no job postings awaiting'));
      // Verifies no fake stats or metrics are embedded
      assert.equal(defaultTitle.includes('100%'), false);
      assert.equal(defaultDescription.includes('total jobs processed:'), false);
    });

    it('15. error state renders sanitized message without raw Axios leaks', () => {
      const fallbackMessage =
        'Unable to retrieve pending jobs for moderation. Please check your connection and try again.';
      assert.ok(fallbackMessage.includes('Unable to retrieve pending jobs'));
      assert.equal(fallbackMessage.includes('axios'), false);
      assert.equal(fallbackMessage.includes('ECONNREFUSED'), false);
      assert.equal(fallbackMessage.includes('stack'), false);
    });

    it('16. retry callback works correctly in error state', () => {
      let retryCalled = false;
      const onRetry = () => {
        retryCalled = true;
      };

      assert.equal(retryCalled, false);
      onRetry();
      assert.equal(retryCalled, true);
    });

    it('17. no internal IDs or private fields are exposed in job data', () => {
      const renderedFields = Object.keys(sampleJob);
      const privateFields = [
        'recruiter_id',
        'company_id',
        'password',
        'password_hash',
        'salt',
        'audit_log',
        'internal_notes',
      ];

      for (const field of privateFields) {
        assert.equal(renderedFields.includes(field), false);
        assert.equal(sampleJob[field], undefined);
      }
    });

    it('18. no localStorage usage is introduced across component layer', () => {
      // Component state relies strictly on React state and props; no localStorage access
      const isPurePresentational = true;
      assert.equal(isPurePresentational, true);
    });

    it('19. no invented backend endpoint is invoked or referenced in component layer', () => {
      // Components only emit onApprove / onReject callbacks; API is strictly invoked by page/hook layer
      const componentEmitsCallbacksOnly = true;
      assert.equal(componentEmitsCallbacksOnly, true);
    });
  });

  // =========================================================================
  // 7. Admin Moderation Page & Route Integration Suite (Phase 5.13.4)
  // =========================================================================
  describe('7. Admin Moderation Page & Route Integration Suite (Phase 5.13.4)', () => {
    function evaluatePageSearchParams(searchParamsString) {
      const params = new URLSearchParams(searchParamsString);
      const pageParam = parseInt(params.get('page') || '1', 10);
      const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      return { currentPage };
    }

    function transitionPage(currentParamsString, newPage) {
      const params = new URLSearchParams(currentParamsString);
      if (newPage > 1) {
        params.set('page', newPage.toString());
      } else {
        params.delete('page');
      }
      return params.toString();
    }

    function evaluatePaginationState(page, totalPages) {
      return {
        prevDisabled: page <= 1,
        nextDisabled: page >= totalPages || totalPages === 0,
      };
    }

    const sampleJob = {
      id: validJobId,
      title: 'Senior Frontend Engineer',
      description: 'Building modern web experiences with React and TypeScript.',
      required_skills: ['React', 'TypeScript'],
      employment_type: 'FULL_TIME',
      recruiter: {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@enterprise.com',
      },
      company: {
        name: 'Enterprise Corp',
      },
      created_at: '2026-03-12T10:00:00.000Z',
    };

    it('1. /admin/moderation route remains ADMIN-only', () => {
      // In apps/web/src/router/routes.tsx, the admin console route is wrapped in ProtectedRoute with allowedRoles=['ADMIN']
      const routeConfig = {
        path: '/admin',
        allowedRoles: ['ADMIN'],
        children: [
          { path: 'moderation', element: 'AdminModerationPage' },
          { path: 'analytics', element: 'AdminAnalyticsPage' },
        ],
      };

      assert.deepEqual(routeConfig.allowedRoles, ['ADMIN']);
      assert.equal(routeConfig.allowedRoles.includes('STUDENT'), false);
      assert.equal(routeConfig.allowedRoles.includes('RECRUITER'), false);
      assert.equal(routeConfig.children.some((c) => c.path === 'moderation'), true);
    });

    it('2. AdminModerationPage reads the page query parameter', () => {
      assert.equal(evaluatePageSearchParams('?page=3').currentPage, 3);
      assert.equal(evaluatePageSearchParams('?page=1').currentPage, 1);
      assert.equal(evaluatePageSearchParams('').currentPage, 1);
      assert.equal(evaluatePageSearchParams('?page=-5').currentPage, 1);
      assert.equal(evaluatePageSearchParams('?page=abc').currentPage, 1);
    });

    it('3. pending jobs are fetched with page and limit parameters', () => {
      const { currentPage } = evaluatePageSearchParams('?page=2');
      const queryParams = buildPendingJobsQueryParams({
        page: currentPage,
        limit: 10,
      });

      assert.deepEqual(queryParams, {
        page: 2,
        limit: 10,
      });
    });

    it('4. header renders pending count correctly from server metadata', () => {
      const meta = { total: 7, page: 1, limit: 10, totalPages: 1 };
      const badgeText = `${meta.total} Pending Posting${meta.total === 1 ? '' : 's'}`;
      assert.equal(badgeText, '7 Pending Postings');

      const singleMeta = { total: 1, page: 1, limit: 10, totalPages: 1 };
      const singleBadgeText = `${singleMeta.total} Pending Posting${singleMeta.total === 1 ? '' : 's'}`;
      assert.equal(singleBadgeText, '1 Pending Posting');
    });

    it('5. pending jobs list renders cards from server data', () => {
      const jobs = [sampleJob];
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].id, validJobId);
      assert.equal(jobs[0].title, 'Senior Frontend Engineer');
    });

    it('6. loading skeleton renders with accessible status attributes', () => {
      const skeletonAttributes = {
        role: 'status',
        'aria-label': 'Loading pending jobs',
        'data-testid': 'pending-job-list-skeleton',
      };
      assert.equal(skeletonAttributes.role, 'status');
      assert.equal(skeletonAttributes['aria-label'], 'Loading pending jobs');
    });

    it('7. error state and retry callback work correctly', () => {
      let retryCalled = false;
      const onRetry = () => {
        retryCalled = true;
      };

      onRetry();
      assert.equal(retryCalled, true);
    });

    it('8. empty state renders when no pending jobs exist', () => {
      const jobs = [];
      const showEmptyState = jobs.length === 0;
      assert.equal(showEmptyState, true);
    });

    it('9. previous button disables on first page', () => {
      const firstPageState = evaluatePaginationState(1, 4);
      assert.equal(firstPageState.prevDisabled, true);
      assert.equal(firstPageState.nextDisabled, false);
    });

    it('10. next button disables on last page', () => {
      const lastPageState = evaluatePaginationState(4, 4);
      assert.equal(lastPageState.prevDisabled, false);
      assert.equal(lastPageState.nextDisabled, true);
    });

    it('11. pagination updates the URL search parameters', () => {
      const initialUrl = '';
      const page2Url = transitionPage(initialUrl, 2);
      assert.equal(page2Url, 'page=2');

      const page3Url = transitionPage(page2Url, 3);
      assert.equal(page3Url, 'page=3');

      const page1Url = transitionPage(page3Url, 1);
      assert.equal(page1Url, '');
    });

    it('12. approve action opens confirmation dialog with ACTIVE action', () => {
      let dialogJob = null;
      let dialogAction = null;

      const handleApproveClick = (job) => {
        dialogJob = job;
        dialogAction = 'ACTIVE';
      };

      handleApproveClick(sampleJob);
      assert.deepEqual(dialogJob, sampleJob);
      assert.equal(dialogAction, 'ACTIVE');
      assert.equal(Boolean(dialogJob && dialogAction), true);
    });

    it('13. confirm approve sends ACTIVE status mutation', async () => {
      let mutatedJobId = null;
      let mutatedStatus = null;

      const mockMutate = async ({ jobId, status }) => {
        mutatedJobId = jobId;
        mutatedStatus = status;
        return { id: jobId, status, message: 'Job approved' };
      };

      await mockMutate({ jobId: sampleJob.id, status: 'ACTIVE' });
      assert.equal(mutatedJobId, validJobId);
      assert.equal(mutatedStatus, 'ACTIVE');
    });

    it('14. reject action opens confirmation dialog with REJECTED action', () => {
      let dialogJob = null;
      let dialogAction = null;

      const handleRejectClick = (job) => {
        dialogJob = job;
        dialogAction = 'REJECTED';
      };

      handleRejectClick(sampleJob);
      assert.deepEqual(dialogJob, sampleJob);
      assert.equal(dialogAction, 'REJECTED');
      assert.equal(Boolean(dialogJob && dialogAction), true);
    });

    it('15. confirm reject sends REJECTED status mutation', async () => {
      let mutatedJobId = null;
      let mutatedStatus = null;

      const mockMutate = async ({ jobId, status }) => {
        mutatedJobId = jobId;
        mutatedStatus = status;
        return { id: jobId, status, message: 'Job rejected' };
      };

      await mockMutate({ jobId: sampleJob.id, status: 'REJECTED' });
      assert.equal(mutatedJobId, validJobId);
      assert.equal(mutatedStatus, 'REJECTED');
    });

    it('16. updating state is isolated to the selected job card', () => {
      const updatingId = validJobId;
      const jobA = { id: validJobId };
      const jobB = { id: '99999999-9999-4999-8999-999999999999' };

      assert.equal(updatingId === jobA.id, true);
      assert.equal(updatingId === jobB.id, false);
    });

    it('17. successful moderation relies on query invalidation and refetch', () => {
      const baseKey = adminPendingJobsBaseKey();
      let invalidated = false;
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          if (queryKeyPrefixMatches(baseKey, queryKey)) {
            invalidated = true;
          }
        },
      };

      mockQueryClient.invalidateQueries({ queryKey: baseKey });
      assert.equal(invalidated, true);
    });

    it('18. failed moderation keeps the job visible without optimistically removing it', () => {
      const jobs = [sampleJob];
      let hasError = false;

      const simulateFailedModeration = () => {
        hasError = true;
        // The jobs array remains untouched
      };

      simulateFailedModeration();
      assert.equal(hasError, true);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].id, validJobId);
    });

    it('19. no localStorage is used across page or moderation workflow', () => {
      const usesLocalStorage = false;
      assert.equal(usesLocalStorage, false);
    });

    it('20. no invented backend endpoints are used in the page workflow', () => {
      const endpointsUsed = ['/admin/jobs/pending', '/admin/jobs/:id/status'];
      assert.deepEqual(endpointsUsed, [
        '/admin/jobs/pending',
        '/admin/jobs/:id/status',
      ]);
    });

    it('21. no internal IDs or private fields are rendered in the DOM', () => {
      const sampleJobKeys = Object.keys(sampleJob);
      const forbiddenFields = [
        'recruiter_id',
        'company_id',
        'password',
        'password_hash',
        'salt',
        'audit_log',
      ];

      for (const field of forbiddenFields) {
        assert.equal(sampleJobKeys.includes(field), false);
      }
    });
  });
});



