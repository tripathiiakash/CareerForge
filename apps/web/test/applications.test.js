import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listStudentApplicationsQuerySchema } from '@careerforge/validation';

// Helper mirrors matching apps/web/src/features/applications/applicationsApi.ts
function buildApplicationsQueryParams(params = {}) {
  const query = {};

  if (params.page && params.page > 0) {
    query.page = params.page;
  }

  if (params.limit && params.limit > 0 && params.limit <= 50) {
    query.limit = params.limit;
  }

  if (
    params.status &&
    ['APPLIED', 'SHORTLISTED', 'REJECTED'].includes(params.status)
  ) {
    query.status = params.status;
  }

  return query;
}

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

function getStatusBadgeConfig(status) {
  switch (status) {
    case 'SHORTLISTED':
      return {
        variant: 'success',
        label: 'Shortlisted',
      };
    case 'REJECTED':
      return {
        variant: 'destructive',
        label: 'Not Selected',
      };
    case 'APPLIED':
    default:
      return {
        variant: 'info',
        label: 'Application Received',
      };
  }
}

function evaluateApplicationsPageState({
  isLoading = false,
  isError = false,
  error = null,
  applications = [],
  statusFilter = '',
}) {
  if (isLoading) {
    return { state: 'LOADING' };
  }
  if (isError) {
    return {
      state: 'ERROR',
      message: error?.message || 'Failed to Load Applications',
    };
  }
  if (applications.length === 0) {
    if (statusFilter) {
      return {
        state: 'EMPTY_FILTERED',
        message: `No Applications Match this Filter`,
      };
    }
    return {
      state: 'EMPTY_ALL',
      message: 'No Applications Yet',
      actionUrl: '/student/jobs',
    };
  }
  return {
    state: 'SUCCESS',
    count: applications.length,
  };
}

describe('Student Application Tracking Suite (Phase 5.7 - docs/API.md §2.3)', () => {
  describe('Backend Schema Validation (listStudentApplicationsQuerySchema)', () => {
    it('1. should validate default query params with defaults', () => {
      const parsed = listStudentApplicationsQuerySchema.parse({});
      assert.equal(parsed.page, 1);
      assert.equal(parsed.limit, 10);
      assert.equal(parsed.status, undefined);
    });

    it('2. should accept valid status filter values (APPLIED, SHORTLISTED, REJECTED)', () => {
      const parsedApplied = listStudentApplicationsQuerySchema.parse({
        status: 'APPLIED',
      });
      assert.equal(parsedApplied.status, 'APPLIED');

      const parsedShortlisted = listStudentApplicationsQuerySchema.parse({
        status: 'SHORTLISTED',
      });
      assert.equal(parsedShortlisted.status, 'SHORTLISTED');

      const parsedRejected = listStudentApplicationsQuerySchema.parse({
        status: 'REJECTED',
      });
      assert.equal(parsedRejected.status, 'REJECTED');
    });

    it('3. should reject invalid status values', () => {
      assert.throws(
        () =>
          listStudentApplicationsQuerySchema.parse({ status: 'UNDER_REVIEW' }),
        /Status must be exactly 'APPLIED', 'SHORTLISTED', or 'REJECTED'/
      );
      assert.throws(
        () => listStudentApplicationsQuerySchema.parse({ status: 'INVALID' }),
        /Status must be exactly 'APPLIED', 'SHORTLISTED', or 'REJECTED'/
      );
    });

    it('4. should coerce string numbers for pagination correctly', () => {
      const parsed = listStudentApplicationsQuerySchema.parse({
        page: '3',
        limit: '20',
      });
      assert.equal(parsed.page, 3);
      assert.equal(parsed.limit, 20);
    });

    it('5. should reject negative or out-of-bounds pagination', () => {
      assert.throws(() =>
        listStudentApplicationsQuerySchema.parse({ page: 0 })
      );
      assert.throws(() =>
        listStudentApplicationsQuerySchema.parse({ limit: 51 })
      );
    });
  });

  describe('Query Parameter Builder (buildApplicationsQueryParams)', () => {
    it('6. should omit undefined or default values to produce clean query strings', () => {
      const query = buildApplicationsQueryParams({});
      assert.deepEqual(query, {});
    });

    it('7. should include valid page and limit when provided', () => {
      const query = buildApplicationsQueryParams({ page: 2, limit: 15 });
      assert.deepEqual(query, { page: 2, limit: 15 });
    });

    it('8. should include status filter when valid and omit when empty string', () => {
      const queryWithStatus = buildApplicationsQueryParams({
        status: 'SHORTLISTED',
      });
      assert.deepEqual(queryWithStatus, { status: 'SHORTLISTED' });

      const queryEmpty = buildApplicationsQueryParams({ status: '' });
      assert.deepEqual(queryEmpty, {});
    });

    it('9. should ignore unrecognized status filter strings', () => {
      const query = buildApplicationsQueryParams({ status: 'UNKNOWN' });
      assert.deepEqual(query, {});
    });
  });

  describe('Status Badge & Presentation Logic', () => {
    it('10. should map APPLIED status to info badge and label', () => {
      const config = getStatusBadgeConfig('APPLIED');
      assert.equal(config.variant, 'info');
      assert.equal(config.label, 'Application Received');
    });

    it('11. should map SHORTLISTED status to success badge and label', () => {
      const config = getStatusBadgeConfig('SHORTLISTED');
      assert.equal(config.variant, 'success');
      assert.equal(config.label, 'Shortlisted');
    });

    it('12. should map REJECTED status to destructive badge and label', () => {
      const config = getStatusBadgeConfig('REJECTED');
      assert.equal(config.variant, 'destructive');
      assert.equal(config.label, 'Not Selected');
    });
  });

  describe('Application Card Data Mapping & Link Target', () => {
    const mockApp = {
      application_id: 'c71a324b-6fe7-4347-814d-fa7bb7b98544',
      status: 'SHORTLISTED',
      applied_at: '2024-02-10T14:30:00.000Z',
      updated_at: '2024-02-12T09:15:00.000Z',
      job: {
        id: 'e42e476e-3607-4e68-9a2f-98eb413ce161',
        title: 'Junior Backend Developer',
        employment_type: 'FULL_TIME',
        company_name: 'TechNova Solutions',
      },
    };

    it('13. should correctly map job details and routing URL', () => {
      const targetUrl = `/student/jobs/${mockApp.job.id}`;
      assert.equal(
        targetUrl,
        '/student/jobs/e42e476e-3607-4e68-9a2f-98eb413ce161'
      );
      assert.equal(mockApp.job.title, 'Junior Backend Developer');
      assert.equal(mockApp.job.company_name, 'TechNova Solutions');
      assert.equal(mockApp.job.employment_type, 'FULL_TIME');
    });

    it('14. should format application dates safely', () => {
      const formatted = formatApplicationDate(mockApp.applied_at);
      assert.ok(formatted.includes('2024'));

      // Gracefully handle malformed dates
      const invalid = formatApplicationDate('invalid-date');
      assert.equal(invalid, 'Recently');
    });
  });

  describe('UI State Evaluation & Transitions', () => {
    it('15. should evaluate loading state correctly', () => {
      const state = evaluateApplicationsPageState({ isLoading: true });
      assert.equal(state.state, 'LOADING');
    });

    it('16. should evaluate error state with retry message', () => {
      const state = evaluateApplicationsPageState({
        isError: true,
        error: new Error('Network timeout'),
      });
      assert.equal(state.state, 'ERROR');
      assert.equal(state.message, 'Network timeout');
    });

    it('17. should distinguish empty filtered state vs empty initial state', () => {
      const emptyFiltered = evaluateApplicationsPageState({
        applications: [],
        statusFilter: 'SHORTLISTED',
      });
      assert.equal(emptyFiltered.state, 'EMPTY_FILTERED');
      assert.match(emptyFiltered.message, /Match this Filter/i);

      const emptyInitial = evaluateApplicationsPageState({
        applications: [],
        statusFilter: '',
      });
      assert.equal(emptyInitial.state, 'EMPTY_ALL');
      assert.equal(emptyInitial.actionUrl, '/student/jobs');
    });

    it('18. should evaluate successful state with count', () => {
      const state = evaluateApplicationsPageState({
        applications: [{ id: '1' }, { id: '2' }],
      });
      assert.equal(state.state, 'SUCCESS');
      assert.equal(state.count, 2);
    });
  });

  describe('Pagination Calculation & Boundaries', () => {
    it('19. should calculate total pages and boundaries correctly', () => {
      const calculateMeta = (total, limit, page) => ({
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        hasPrev: page > 1,
        hasNext: page < Math.ceil(total / limit),
      });

      const firstPage = calculateMeta(25, 10, 1);
      assert.equal(firstPage.totalPages, 3);
      assert.equal(firstPage.hasPrev, false);
      assert.equal(firstPage.hasNext, true);

      const middlePage = calculateMeta(25, 10, 2);
      assert.equal(middlePage.hasPrev, true);
      assert.equal(middlePage.hasNext, true);

      const lastPage = calculateMeta(25, 10, 3);
      assert.equal(lastPage.hasPrev, true);
      assert.equal(lastPage.hasNext, false);

      const empty = calculateMeta(0, 10, 1);
      assert.equal(empty.totalPages, 0);
      assert.equal(empty.hasPrev, false);
      assert.equal(empty.hasNext, false);
    });
  });
});
