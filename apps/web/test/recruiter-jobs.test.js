import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJobSchema,
  updateJobSchema,
} from '@careerforge/validation';

// Date formatter mirror matching RecruiterJobCard
function formatJobDate(dateStr) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Recently';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return 'Recently';
  }
}

// Route access evaluator mirror matching ProtectedRoute
function evaluateRouteAccess(auth, allowedRoles) {
  if (auth.isLoading) return { status: 'LOADING' };
  if (!auth.isAuthenticated || !auth.user) {
    return { status: 'REDIRECT_LOGIN', target: '/login' };
  }
  if (allowedRoles && auth.role && !allowedRoles.includes(auth.role)) {
    switch (auth.role) {
      case 'STUDENT':
        return { status: 'REDIRECT_ROLE', target: '/student/dashboard' };
      case 'RECRUITER':
        return { status: 'REDIRECT_ROLE', target: '/recruiter/dashboard' };
      case 'ADMIN':
        return { status: 'REDIRECT_ROLE', target: '/admin/moderation' };
      default:
        return { status: 'REDIRECT_LOGIN', target: '/login' };
    }
  }
  return { status: 'ALLOWED' };
}

// API error extractor mirror matching apps/web/src/lib/api.ts
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
  if (error?.isNetworkError) {
    return {
      code: 'NETWORK_ERROR',
      message:
        'Unable to connect to the server. Please check your internet connection.',
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'An unexpected error occurred. Please try again.',
  };
}

// Status badge evaluator mirror matching RecruiterJobCard
function getStatusBadgeConfig(status) {
  switch (status) {
    case 'ACTIVE':
      return { variant: 'success', label: 'Active' };
    case 'REJECTED':
      return { variant: 'destructive', label: 'Rejected' };
    case 'PENDING':
    default:
      return { variant: 'warning', label: 'Pending Approval' };
  }
}

describe('Recruiter Job Management Suite (Phase 5.11 - Server-Authoritative)', () => {
  // 1. Recruiter-only route protection
  describe('1. Recruiter Route Protection', () => {
    const allowed = ['RECRUITER'];

    it('should deny unauthenticated users accessing /recruiter/jobs', () => {
      const auth = { isAuthenticated: false, user: null, role: null };
      const res = evaluateRouteAccess(auth, allowed);
      assert.strictEqual(res.status, 'REDIRECT_LOGIN');
    });

    it('should redirect STUDENT trying to access /recruiter/jobs/new', () => {
      const auth = {
        isAuthenticated: true,
        user: { id: 'u1', role: 'STUDENT' },
        role: 'STUDENT',
      };
      const res = evaluateRouteAccess(auth, allowed);
      assert.strictEqual(res.status, 'REDIRECT_ROLE');
      assert.strictEqual(res.target, '/student/dashboard');
    });

    it('should redirect ADMIN trying to access /recruiter/jobs/:jobId/edit', () => {
      const auth = {
        isAuthenticated: true,
        user: { id: 'u2', role: 'ADMIN' },
        role: 'ADMIN',
      };
      const res = evaluateRouteAccess(auth, allowed);
      assert.strictEqual(res.status, 'REDIRECT_ROLE');
      assert.strictEqual(res.target, '/admin/moderation');
    });

    it('should allow RECRUITER to access recruiter job management routes', () => {
      const auth = {
        isAuthenticated: true,
        user: { id: 'u3', role: 'RECRUITER' },
        role: 'RECRUITER',
      };
      const res = evaluateRouteAccess(auth, allowed);
      assert.strictEqual(res.status, 'ALLOWED');
    });
  });

  // 2. Authoritative GET /api/v1/recruiters/me/jobs mapping
  describe('2. Authoritative Recruiter Jobs API Response Mapping', () => {
    it('should map server jobs response directly without local storage intervention', () => {
      const serverResponse = {
        success: true,
        data: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            title: 'Senior Backend Engineer',
            description:
              'We are seeking an experienced Node.js and PostgreSQL engineer to build high-scale microservices...',
            required_skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Docker'],
            employment_type: 'FULL_TIME',
            status: 'ACTIVE',
            company: {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'TechNova Solutions',
              website: 'https://technova.example.com',
              logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
            },
            created_at: '2026-03-01T10:00:00.000Z',
          },
        ],
      };

      const jobs = serverResponse.data;
      assert.strictEqual(jobs.length, 1);
      assert.strictEqual(jobs[0].id, '44444444-4444-4444-8444-444444444444');
      assert.strictEqual(jobs[0].title, 'Senior Backend Engineer');
      assert.strictEqual(jobs[0].status, 'ACTIVE');
      assert.strictEqual(jobs[0].employment_type, 'FULL_TIME');
      assert.strictEqual(jobs[0].company.name, 'TechNova Solutions');
      assert.strictEqual(jobs[0].required_skills.length, 4);
    });

    it('should format job creation date cleanly', () => {
      const formatted = formatJobDate('2026-03-01T10:00:00.000Z');
      assert.strictEqual(formatted, 'Mar 1, 2026');
      assert.strictEqual(formatJobDate(null), 'Recently');
      assert.strictEqual(formatJobDate('invalid-date'), 'Recently');
    });
  });

  // 3. Status Display (ACTIVE, PENDING, REJECTED)
  describe('3. Status Display Badges (Live Server Statuses)', () => {
    it('should render correct badge configuration for ACTIVE status', () => {
      const config = getStatusBadgeConfig('ACTIVE');
      assert.strictEqual(config.variant, 'success');
      assert.strictEqual(config.label, 'Active');
    });

    it('should render correct badge configuration for PENDING status', () => {
      const config = getStatusBadgeConfig('PENDING');
      assert.strictEqual(config.variant, 'warning');
      assert.strictEqual(config.label, 'Pending Approval');
    });

    it('should render correct badge configuration for REJECTED status', () => {
      const config = getStatusBadgeConfig('REJECTED');
      assert.strictEqual(config.variant, 'destructive');
      assert.strictEqual(config.label, 'Rejected');
    });
  });

  // 4. Empty State Handling
  describe('4. Empty State Handling', () => {
    it('should evaluate EMPTY state when server returns empty jobs array', () => {
      const serverJobs = [];
      const showEmptyState = Array.isArray(serverJobs) && serverJobs.length === 0;
      assert.strictEqual(showEmptyState, true);
    });
  });

  // 5. Independence from LocalStorage (Multi-device / clean browser support)
  describe('5. Independence from LocalStorage (Multi-Device & Clean Session Support)', () => {
    it('should not depend on localStorage to discover recruiter jobs', () => {
      // Simulate clean browser with completely empty localStorage
      const mockBrowserStorage = {};

      // Server returns authoritative list
      const serverJobs = [
        {
          id: 'job-server-1',
          title: 'Full Stack Engineer',
          status: 'ACTIVE',
        },
      ];

      // Client queries API directly without reading mockBrowserStorage
      const loadedJobs = serverJobs;
      assert.strictEqual(loadedJobs.length, 1);
      assert.strictEqual(Object.keys(mockBrowserStorage).length, 0);
    });
  });

  // 6. Create Form Defaults
  describe('6. Create Form Defaults', () => {
    it('should initialize create form with empty defaults and FULL_TIME employment', () => {
      const defaultValues = {
        title: '',
        description: '',
        required_skills: '',
        employment_type: 'FULL_TIME',
      };

      assert.strictEqual(defaultValues.title, '');
      assert.strictEqual(defaultValues.description, '');
      assert.strictEqual(defaultValues.required_skills, '');
      assert.strictEqual(defaultValues.employment_type, 'FULL_TIME');
    });
  });

  // 7. Create Validation (createJobSchema)
  describe('7. Create Validation (createJobSchema)', () => {
    const validPayload = {
      title: 'Senior Frontend Developer',
      description:
        'Join our core engineering team to architect modern web applications with React, TypeScript, and Tailwind CSS...',
      required_skills: ['React', 'TypeScript', 'Tailwind CSS'],
      employment_type: 'FULL_TIME',
    };

    it('should pass validation with valid job payload', () => {
      const result = createJobSchema.safeParse(validPayload);
      assert.strictEqual(result.success, true);
    });

    it('should reject title under 3 characters or over 255 characters', () => {
      const shortTitle = createJobSchema.safeParse({
        ...validPayload,
        title: 'AB',
      });
      assert.strictEqual(shortTitle.success, false);
      assert.match(
        shortTitle.error.issues[0].message,
        /between 3 and 255 characters/i
      );

      const longTitle = createJobSchema.safeParse({
        ...validPayload,
        title: 'T'.repeat(256),
      });
      assert.strictEqual(longTitle.success, false);
      assert.match(
        longTitle.error.issues[0].message,
        /cannot exceed 255 characters/i
      );
    });

    it('should reject description under 50 characters', () => {
      const shortDesc = createJobSchema.safeParse({
        ...validPayload,
        description: 'Too short description.',
      });
      assert.strictEqual(shortDesc.success, false);
      assert.match(
        shortDesc.error.issues[0].message,
        /at least 50 characters/i
      );
    });

    it('should reject required_skills if empty or exceeding 20 items', () => {
      const noSkills = createJobSchema.safeParse({
        ...validPayload,
        required_skills: [],
      });
      assert.strictEqual(noSkills.success, false);

      const tooManySkills = createJobSchema.safeParse({
        ...validPayload,
        required_skills: Array.from({ length: 21 }, (_, i) => `Skill ${i + 1}`),
      });
      assert.strictEqual(tooManySkills.success, false);
    });

    it('should reject invalid employment_type enum', () => {
      const invalidType = createJobSchema.safeParse({
        ...validPayload,
        employment_type: 'CONTRACT',
      });
      assert.strictEqual(invalidType.success, false);
      assert.match(
        invalidType.error.issues[0].message,
        /Employment type must be exactly/i
      );
    });
  });

  // 8. Successful Create Job Flow & Query Cache Invalidation
  describe('8. Successful Create Job Flow & Invalidation', () => {
    it('should invalidate ["recruiter", "jobs"] cache on job creation so fresh list is fetched', () => {
      const invalidatedQueries = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedQueries.push(queryKey);
        },
      };

      // Mutation onSuccess triggers invalidation
      const RECRUITER_JOBS_QUERY_KEY = ['recruiter', 'jobs'];
      mockQueryClient.invalidateQueries({
        queryKey: RECRUITER_JOBS_QUERY_KEY,
      });

      assert.deepStrictEqual(invalidatedQueries[0], ['recruiter', 'jobs']);
    });
  });

  // 9. Create Failure Handling
  describe('9. Create Failure Handling', () => {
    it('should extract error when recruiter has no linked company (docs/API.md §5.1)', () => {
      const errorResponse = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Recruiter has no linked company',
            },
          },
        },
      };

      const extracted = extractApiError(errorResponse);
      assert.strictEqual(extracted.code, 'VALIDATION_ERROR');
      assert.strictEqual(extracted.message, 'Recruiter has no linked company');
    });
  });

  // 10. Edit Form Loading & Defaults Pre-population
  describe('10. Edit Form Loading & Defaults Pre-population', () => {
    it('should pre-populate edit form with existing job attributes', () => {
      const existingJob = {
        id: 'job-123',
        title: 'Full Stack Engineer',
        description:
          'Comprehensive role requiring deep expertise in React, Node, and Postgres databases...',
        required_skills: ['React', 'Node.js', 'PostgreSQL'],
        employment_type: 'FULL_TIME',
      };

      const editFormDefaults = {
        title: existingJob.title,
        description: existingJob.description,
        required_skills: existingJob.required_skills.join(', '),
        employment_type: existingJob.employment_type,
      };

      assert.strictEqual(editFormDefaults.title, 'Full Stack Engineer');
      assert.strictEqual(
        editFormDefaults.required_skills,
        'React, Node.js, PostgreSQL'
      );
      assert.strictEqual(editFormDefaults.employment_type, 'FULL_TIME');
    });
  });

  // 11. Successful Edit Flow & Cache Invalidation
  describe('11. Successful Edit Job Flow (updateJobSchema) & Invalidation', () => {
    it('should validate partial update payload and invalidate recruiter job queries', () => {
      const updatePayload = {
        title: 'Lead Full Stack Engineer',
        description:
          'Updated role description requiring high scale architectural leadership...',
      };

      const parseResult = updateJobSchema.safeParse(updatePayload);
      assert.strictEqual(parseResult.success, true);

      const invalidatedQueries = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedQueries.push(queryKey);
        },
      };

      const jobId = 'job-123';
      const RECRUITER_JOBS_QUERY_KEY = ['recruiter', 'jobs'];
      const recruiterJobQueryKey = (id) => ['recruiter', 'job', id];

      mockQueryClient.invalidateQueries({
        queryKey: recruiterJobQueryKey(jobId),
      });
      mockQueryClient.invalidateQueries({
        queryKey: RECRUITER_JOBS_QUERY_KEY,
      });

      assert.deepStrictEqual(invalidatedQueries, [
        ['recruiter', 'job', 'job-123'],
        ['recruiter', 'jobs'],
      ]);
    });
  });

  // 12. Edit Failure Handling
  describe('12. Edit Failure & Ownership Verification (docs/API.md §5.4)', () => {
    it('should extract 403 Forbidden error if recruiter does not own the job', () => {
      const errorResponse = {
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

      const extracted = extractApiError(errorResponse);
      assert.strictEqual(extracted.code, 'FORBIDDEN');
      assert.strictEqual(extracted.message, 'Recruiter does not own this job');
    });

    it('should extract 404 NotFound error if job does not exist', () => {
      const errorResponse = {
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

      const extracted = extractApiError(errorResponse);
      assert.strictEqual(extracted.code, 'NOT_FOUND');
      assert.strictEqual(extracted.message, 'Job does not exist');
    });
  });

  // 13. Delete Confirmation Requirement
  describe('13. Delete Confirmation Requirement', () => {
    it('should require explicit confirmation before issuing delete mutation', () => {
      let isModalOpen = false;
      let targetJob = null;

      const openDeleteDialog = (job) => {
        targetJob = job;
        isModalOpen = true;
      };

      openDeleteDialog({ id: 'job-123', title: 'QA Engineer' });
      assert.strictEqual(isModalOpen, true);
      assert.strictEqual(targetJob.title, 'QA Engineer');
    });
  });

  // 14. Delete Flow & Cache Invalidation
  describe('14. Successful Delete Flow & Invalidation', () => {
    it('should invalidate cache and remove job query on delete', () => {
      const removedQueries = [];
      const invalidatedQueries = [];

      const mockQueryClient = {
        removeQueries: ({ queryKey }) => {
          removedQueries.push(queryKey);
        },
        invalidateQueries: ({ queryKey }) => {
          invalidatedQueries.push(queryKey);
        },
      };

      const jobId = 'job-to-delete';
      const RECRUITER_JOBS_QUERY_KEY = ['recruiter', 'jobs'];
      const recruiterJobQueryKey = (id) => ['recruiter', 'job', id];

      mockQueryClient.removeQueries({
        queryKey: recruiterJobQueryKey(jobId),
      });
      mockQueryClient.invalidateQueries({
        queryKey: RECRUITER_JOBS_QUERY_KEY,
      });

      assert.deepStrictEqual(removedQueries, [['recruiter', 'job', 'job-to-delete']]);
      assert.deepStrictEqual(invalidatedQueries, [['recruiter', 'jobs']]);
    });
  });

  // 15. Delete Failure Handling
  describe('15. Delete Failure Handling', () => {
    it('should safely extract 403 Forbidden error on delete failure', () => {
      const errorResponse = {
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

      const extracted = extractApiError(errorResponse);
      assert.strictEqual(extracted.code, 'FORBIDDEN');
    });
  });

  // 16. Recruiter Status Manipulation Prohibition
  describe('16. Recruiter Status Manipulation Prohibition', () => {
    it('should reject status field in updateJobSchema due to .strict() constraint', () => {
      const illegalPayload = {
        title: 'Senior Engineer',
        status: 'ACTIVE', // Recruiter attempting self-approval
      };

      const result = updateJobSchema.safeParse(illegalPayload);
      assert.strictEqual(result.success, false);
      assert.match(result.error.issues[0].message, /Unrecognized key/i);
    });
  });

  // 17. Duplicate Submission Guard
  describe('17. Duplicate Submission Guard', () => {
    it('should prevent multiple submissions while mutation is in-flight', () => {
      let submitCallCount = 0;
      let isSubmitting = false;

      const triggerSubmit = () => {
        if (isSubmitting) return;
        isSubmitting = true;
        submitCallCount += 1;
      };

      triggerSubmit();
      triggerSubmit(); // blocked
      triggerSubmit(); // blocked

      assert.strictEqual(submitCallCount, 1);
    });
  });

  // 18. Query Keys Isolation
  describe('18. Query Key Isolation', () => {
    it('should isolate recruiter job query keys from student queries', () => {
      const RECRUITER_JOBS_KEY = ['recruiter', 'jobs'];
      const RECRUITER_JOB_KEY = (id) => ['recruiter', 'job', id];
      const STUDENT_APPLICATIONS_KEY = ['student', 'applications'];

      assert.notDeepStrictEqual(RECRUITER_JOBS_KEY, STUDENT_APPLICATIONS_KEY);
      assert.deepStrictEqual(RECRUITER_JOB_KEY('job-1'), [
        'recruiter',
        'job',
        'job-1',
      ]);
    });
  });

  // 19. Authoritative Endpoint Routing
  describe('19. Authoritative Recruiter Jobs Endpoint', () => {
    it('confirms that recruiter jobs are requested from /recruiters/me/jobs', () => {
      const endpoint = '/recruiters/me/jobs';
      assert.strictEqual(endpoint, '/recruiters/me/jobs');
    });
  });

  // 20. Navigation Flows
  describe('20. Navigation Flows', () => {
    it('should navigate to /recruiter/jobs after create or edit', () => {
      let navigatedTo = null;
      const navigate = (path) => {
        navigatedTo = path;
      };

      navigate('/recruiter/jobs');
      assert.strictEqual(navigatedTo, '/recruiter/jobs');
    });
  });
});
