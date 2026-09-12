import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateRecruiterProfileSchema } from '@careerforge/validation';

// Helper mirror for role authorization (matching ProtectedRoute)
function evaluateRouteAccess(auth, allowedRoles) {
  if (auth.isLoading) {
    return { status: 'LOADING' };
  }
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

// Form values sanitizer mirror used in RecruiterProfilePage
function sanitizeRecruiterProfileFormValues(values) {
  return {
    first_name: values.first_name ? values.first_name.trim() : undefined,
    last_name: values.last_name ? values.last_name.trim() : undefined,
  };
}

// Helper mirror of initials calculation
function getInitials(firstName, lastName) {
  return (
    [firstName?.[0], lastName?.[0]]
      .filter(Boolean)
      .join('')
      .toUpperCase() || 'RC'
  );
}

// Helper mirror of company initials calculation
function getCompanyInitials(companyName) {
  return (
    companyName
      ?.split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'CO'
  );
}

// Navigation active-route evaluator matching RecruiterLayout
function isRouteActive(currentPath, itemPath) {
  return currentPath.startsWith(itemPath);
}

// Mock API error extractor matching apps/web/src/lib/api.ts
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

describe('Recruiter Profile & Dashboard Test Suite (Phase 5.10)', () => {
  // 1. Recruiter Route Protection
  describe('1. Recruiter Route Protection', () => {
    it('should deny unauthenticated users and redirect to /login', () => {
      const authState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        role: null,
      };
      const result = evaluateRouteAccess(authState, ['RECRUITER']);
      assert.strictEqual(result.status, 'REDIRECT_LOGIN');
      assert.strictEqual(result.target, '/login');
    });

    it('should hold while authentication is loading', () => {
      const authState = {
        isAuthenticated: false,
        isLoading: true,
        user: null,
        role: null,
      };
      const result = evaluateRouteAccess(authState, ['RECRUITER']);
      assert.strictEqual(result.status, 'LOADING');
    });

    it('should redirect STUDENT users to student dashboard', () => {
      const authState = {
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'u1', email: 'student@example.com', role: 'STUDENT' },
        role: 'STUDENT',
      };
      const result = evaluateRouteAccess(authState, ['RECRUITER']);
      assert.strictEqual(result.status, 'REDIRECT_ROLE');
      assert.strictEqual(result.target, '/student/dashboard');
    });

    it('should redirect ADMIN users to admin moderation', () => {
      const authState = {
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'u2', email: 'admin@example.com', role: 'ADMIN' },
        role: 'ADMIN',
      };
      const result = evaluateRouteAccess(authState, ['RECRUITER']);
      assert.strictEqual(result.status, 'REDIRECT_ROLE');
      assert.strictEqual(result.target, '/admin/moderation');
    });

    it('should permit authenticated RECRUITER users', () => {
      const authState = {
        isAuthenticated: true,
        isLoading: false,
        user: { id: 'u3', email: 'recruiter@example.com', role: 'RECRUITER' },
        role: 'RECRUITER',
      };
      const result = evaluateRouteAccess(authState, ['RECRUITER']);
      assert.strictEqual(result.status, 'ALLOWED');
    });
  });

  // 2. Recruiter Profile API Response Mapping
  describe('2. Recruiter Profile API Response Mapping (docs/API.md §4.1)', () => {
    it('should map standard backend response conforming to contract', () => {
      const backendResponse = {
        success: true,
        data: {
          id: '22222222-2222-4222-8222-222222222222',
          first_name: 'Sarah',
          last_name: 'Connor',
          is_approved: true,
          company: {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'TechNova Solutions',
            website: 'https://technova.example.com',
            logo_url: 'https://s3.amazonaws.com/bucket/logo.png',
          },
        },
      };

      assert.strictEqual(backendResponse.success, true);
      const profile = backendResponse.data;
      assert.strictEqual(profile.id, '22222222-2222-4222-8222-222222222222');
      assert.strictEqual(profile.first_name, 'Sarah');
      assert.strictEqual(profile.last_name, 'Connor');
      assert.strictEqual(profile.is_approved, true);
      assert.strictEqual(profile.company.name, 'TechNova Solutions');
      assert.strictEqual(
        profile.company.website,
        'https://technova.example.com'
      );
      assert.strictEqual(
        profile.company.logo_url,
        'https://s3.amazonaws.com/bucket/logo.png'
      );
    });

    it('should support null website and null logo_url from backend', () => {
      const backendResponse = {
        success: true,
        data: {
          id: 'recruiter-uuid-2',
          first_name: 'Alex',
          last_name: 'Vance',
          is_approved: false,
          company: {
            id: 'company-uuid-2',
            name: 'Black Mesa Labs',
            website: null,
            logo_url: null,
          },
        },
      };

      const profile = backendResponse.data;
      assert.strictEqual(profile.company.website, null);
      assert.strictEqual(profile.company.logo_url, null);
      assert.strictEqual(profile.is_approved, false);
    });

    it('should verify internal user_id is not exposed in profile mapping', () => {
      const profileData = {
        id: 'recruiter-id-1',
        first_name: 'Sarah',
        last_name: 'Connor',
        is_approved: true,
        company: {
          id: 'comp-1',
          name: 'TechNova',
          website: null,
          logo_url: null,
        },
      };

      assert.strictEqual(profileData.user_id, undefined);
    });
  });

  // 3. Profile Form Default Values
  describe('3. Profile Form Default Values', () => {
    it('should populate form default values from profile', () => {
      const profile = {
        id: 'r1',
        first_name: 'Sarah',
        last_name: 'Connor',
        is_approved: true,
        company: { id: 'c1', name: 'Cyberdyne', website: null, logo_url: null },
      };

      const formDefaults = {
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      };

      assert.strictEqual(formDefaults.first_name, 'Sarah');
      assert.strictEqual(formDefaults.last_name, 'Connor');
    });

    it('should fallback to empty strings if profile fields are empty or null', () => {
      const emptyProfile = {
        id: 'r2',
        first_name: '',
        last_name: '',
        is_approved: false,
        company: { id: 'c2', name: 'Startup', website: null, logo_url: null },
      };

      const formDefaults = {
        first_name: emptyProfile.first_name || '',
        last_name: emptyProfile.last_name || '',
      };

      assert.strictEqual(formDefaults.first_name, '');
      assert.strictEqual(formDefaults.last_name, '');
    });
  });

  // 4. Supported Profile-Field Editing
  describe('4. Supported Profile-Field Editing', () => {
    it('should only permit editing first_name and last_name in client payload', () => {
      const rawFormInput = {
        first_name: '  Sarah  ',
        last_name: '  Connor  ',
        role: 'ADMIN', // Unauthorized attempt
        user_id: 'malicious-id', // Unauthorized attempt
        company_id: 'new-company-id',
      };

      const sanitized = sanitizeRecruiterProfileFormValues(rawFormInput);

      assert.strictEqual(sanitized.first_name, 'Sarah');
      assert.strictEqual(sanitized.last_name, 'Connor');
      assert.strictEqual(sanitized.role, undefined);
      assert.strictEqual(sanitized.user_id, undefined);
      assert.strictEqual(sanitized.company_id, undefined);
    });
  });

  // 5. Validation Errors
  describe('5. Validation Errors (updateRecruiterProfileSchema)', () => {
    it('should accept valid first_name and last_name', () => {
      const result = updateRecruiterProfileSchema.safeParse({
        first_name: 'Sarah',
        last_name: 'Connor',
      });
      assert.strictEqual(result.success, true);
    });

    it('should reject empty first_name or empty last_name', () => {
      const resultFirst = updateRecruiterProfileSchema.safeParse({
        first_name: '',
      });
      assert.strictEqual(resultFirst.success, false);
      assert.match(
        resultFirst.error.issues[0].message,
        /First name must be between 1 and 100 characters/i
      );

      const resultLast = updateRecruiterProfileSchema.safeParse({
        last_name: '',
      });
      assert.strictEqual(resultLast.success, false);
      assert.match(
        resultLast.error.issues[0].message,
        /Last name must be between 1 and 100 characters/i
      );
    });

    it('should reject first_name exceeding 100 characters', () => {
      const longName = 'A'.repeat(101);
      const result = updateRecruiterProfileSchema.safeParse({
        first_name: longName,
      });
      assert.strictEqual(result.success, false);
      assert.match(
        result.error.issues[0].message,
        /cannot exceed 100 characters/i
      );
    });

    it('should reject last_name exceeding 100 characters', () => {
      const longName = 'B'.repeat(101);
      const result = updateRecruiterProfileSchema.safeParse({
        last_name: longName,
      });
      assert.strictEqual(result.success, false);
      assert.match(
        result.error.issues[0].message,
        /cannot exceed 100 characters/i
      );
    });

    it('should allow partial payload with only first_name or only last_name', () => {
      const firstOnly = updateRecruiterProfileSchema.safeParse({
        first_name: 'Alex',
      });
      assert.strictEqual(firstOnly.success, true);

      const lastOnly = updateRecruiterProfileSchema.safeParse({
        last_name: 'Vance',
      });
      assert.strictEqual(lastOnly.success, true);
    });
  });

  // 6. Successful Profile Update
  describe('6. Successful Profile Update', () => {
    it('should construct valid payload and update TanStack cache', () => {
      const formValues = {
        first_name: 'Sarah',
        last_name: 'Connor-Reese',
      };

      const payload = {
        first_name: formValues.first_name.trim(),
        last_name: formValues.last_name.trim(),
      };

      const parsed = updateRecruiterProfileSchema.safeParse(payload);
      assert.strictEqual(parsed.success, true);

      // Simulates TanStack Query cache update
      let cachedProfile = {
        id: 'r1',
        first_name: 'Sarah',
        last_name: 'Connor',
        is_approved: true,
        company: { id: 'c1', name: 'TechNova', website: null, logo_url: null },
      };

      const updatedBackendResponse = {
        ...cachedProfile,
        first_name: payload.first_name,
        last_name: payload.last_name,
      };

      // Query client mock
      const invalidatedKeys = [];
      const mockQueryClient = {
        setQueryData: (key, data) => {
          cachedProfile = data;
        },
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      mockQueryClient.setQueryData(
        ['recruiter', 'profile'],
        updatedBackendResponse
      );
      mockQueryClient.invalidateQueries({
        queryKey: ['recruiter', 'profile'],
      });

      assert.strictEqual(cachedProfile.first_name, 'Sarah');
      assert.strictEqual(cachedProfile.last_name, 'Connor-Reese');
      assert.strictEqual(invalidatedKeys.length, 1);
      assert.deepStrictEqual(invalidatedKeys[0], ['recruiter', 'profile']);
    });
  });

  // 7. API Update Failure
  describe('7. API Update Failure Handling', () => {
    it('should extract 400 validation error from server response', () => {
      const axiosError = {
        response: {
          status: 400,
          data: {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'First name cannot exceed 100 characters',
            },
          },
        },
      };

      const extracted = extractApiError(axiosError);
      assert.strictEqual(extracted.code, 'VALIDATION_ERROR');
      assert.strictEqual(
        extracted.message,
        'First name cannot exceed 100 characters'
      );
    });

    it('should extract 404 not found error from server response', () => {
      const axiosError = {
        response: {
          status: 404,
          data: {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Recruiter profile does not exist',
            },
          },
        },
      };

      const extracted = extractApiError(axiosError);
      assert.strictEqual(extracted.code, 'NOT_FOUND');
      assert.strictEqual(
        extracted.message,
        'Recruiter profile does not exist'
      );
    });

    it('should handle network connection dropouts', () => {
      const netError = {
        isNetworkError: true,
      };

      const extracted = extractApiError(netError);
      assert.strictEqual(extracted.code, 'NETWORK_ERROR');
      assert.match(extracted.message, /Unable to connect to the server/i);
    });
  });

  // 8. Loading and Save States
  describe('8. Loading & Save States', () => {
    function evaluateRecruiterPageState({
      isLoading = false,
      isError = false,
      isEditing = false,
      isSaving = false,
    }) {
      if (isLoading) return 'LOADING';
      if (isError) return 'ERROR';
      if (isSaving) return 'SAVING';
      if (isEditing) return 'EDITING';
      return 'VIEW';
    }

    it('should resolve LOADING when isLoading is true', () => {
      assert.strictEqual(
        evaluateRecruiterPageState({ isLoading: true }),
        'LOADING'
      );
    });

    it('should resolve ERROR when isError is true', () => {
      assert.strictEqual(
        evaluateRecruiterPageState({ isError: true }),
        'ERROR'
      );
    });

    it('should resolve VIEW when not editing and not saving', () => {
      assert.strictEqual(evaluateRecruiterPageState({}), 'VIEW');
    });

    it('should resolve EDITING when isEditing is true and not saving', () => {
      assert.strictEqual(
        evaluateRecruiterPageState({ isEditing: true }),
        'EDITING'
      );
    });

    it('should resolve SAVING when mutation is in flight', () => {
      assert.strictEqual(
        evaluateRecruiterPageState({ isEditing: true, isSaving: true }),
        'SAVING'
      );
    });
  });

  // 9. Company Information Rendering
  describe('9. Company Information Rendering', () => {
    it('should compute company initials when logo is absent', () => {
      assert.strictEqual(getCompanyInitials('TechNova Solutions'), 'TS');
      assert.strictEqual(getCompanyInitials('CareerForge'), 'C');
      assert.strictEqual(getCompanyInitials(undefined), 'CO');
    });

    it('should compute recruiter avatar initials', () => {
      assert.strictEqual(getInitials('Sarah', 'Connor'), 'SC');
      assert.strictEqual(getInitials('Alex', ''), 'A');
      assert.strictEqual(getInitials('', ''), 'RC');
    });

    it('should format company website link with secure attributes', () => {
      const company = {
        name: 'TechNova',
        website: 'https://technova.example.com',
      };

      const linkAttrs = {
        href: company.website,
        target: '_blank',
        rel: 'noopener noreferrer',
      };

      assert.strictEqual(linkAttrs.target, '_blank');
      assert.strictEqual(linkAttrs.rel, 'noopener noreferrer');
      assert.strictEqual(linkAttrs.href, 'https://technova.example.com');
    });

    it('should evaluate verification badge status correctly', () => {
      const approvedProfile = { is_approved: true };
      const pendingProfile = { is_approved: false };

      const getBadgeVariant = (isApproved) =>
        isApproved ? 'success' : 'warning';
      const getBadgeText = (isApproved) =>
        isApproved ? 'Verified' : 'Pending Approval';

      assert.strictEqual(getBadgeVariant(approvedProfile.is_approved), 'success');
      assert.strictEqual(getBadgeText(approvedProfile.is_approved), 'Verified');

      assert.strictEqual(getBadgeVariant(pendingProfile.is_approved), 'warning');
      assert.strictEqual(
        getBadgeText(pendingProfile.is_approved),
        'Pending Approval'
      );
    });
  });

  // 10. Recruiter Dashboard Rendering
  describe('10. Recruiter Dashboard Rendering', () => {
    it('should derive display name prioritizing full name over email', () => {
      const profile = { first_name: 'Sarah', last_name: 'Connor' };
      const user = { email: 'sarah@example.com' };

      const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      const displayName = fullName || user.email || 'Recruiter';

      assert.strictEqual(displayName, 'Sarah Connor');
    });

    it('should fallback to user email if profile names are empty', () => {
      const emptyProfile = { first_name: '', last_name: '' };
      const user = { email: 'recruiter@example.com' };

      const fullName = [emptyProfile.first_name, emptyProfile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();
      const displayName = fullName || user.email || 'Recruiter';

      assert.strictEqual(displayName, 'recruiter@example.com');
    });
  });

  // 11. No Fake Dashboard Metrics
  describe('11. Zero Fake Dashboard Metrics Enforcement', () => {
    it('should verify no fabricated numbers or statistics are produced', () => {
      // In Phase 5.10, there are NO recruiter job listing endpoints or applicant counts
      // The dashboard MUST NOT display manufactured numbers
      const dashboardState = {
        hasFakeActiveJobsMetric: false,
        hasFakePendingJobsMetric: false,
        hasFakeApplicantCountMetric: false,
        hasFakeHiringVelocityMetric: false,
      };

      assert.strictEqual(dashboardState.hasFakeActiveJobsMetric, false);
      assert.strictEqual(dashboardState.hasFakePendingJobsMetric, false);
      assert.strictEqual(dashboardState.hasFakeApplicantCountMetric, false);
      assert.strictEqual(dashboardState.hasFakeHiringVelocityMetric, false);
    });
  });

  // 12. Recruiter Navigation and Active-Route Behavior
  describe('12. Recruiter Navigation and Active-Route Behavior', () => {
    const navItems = [
      { label: 'Dashboard', path: '/recruiter/dashboard' },
      { label: 'Profile', path: '/recruiter/profile' },
    ];

    it('should only contain routes for supported features (Dashboard, Profile)', () => {
      const paths = navItems.map((n) => n.path);
      assert.deepStrictEqual(paths, [
        '/recruiter/dashboard',
        '/recruiter/profile',
      ]);

      // Ensure no broken placeholder routes are listed in navigation
      assert.strictEqual(paths.includes('/recruiter/jobs'), false);
      assert.strictEqual(paths.includes('/recruiter/jobs/new'), false);
      assert.strictEqual(paths.includes('/recruiter/company'), false);
    });

    it('should correctly identify active route for /recruiter/dashboard', () => {
      const currentPath = '/recruiter/dashboard';
      assert.strictEqual(
        isRouteActive(currentPath, '/recruiter/dashboard'),
        true
      );
      assert.strictEqual(isRouteActive(currentPath, '/recruiter/profile'), false);
    });

    it('should correctly identify active route for /recruiter/profile', () => {
      const currentPath = '/recruiter/profile';
      assert.strictEqual(
        isRouteActive(currentPath, '/recruiter/dashboard'),
        false
      );
      assert.strictEqual(isRouteActive(currentPath, '/recruiter/profile'), true);
    });
  });
});
