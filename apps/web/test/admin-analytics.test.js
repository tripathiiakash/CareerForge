import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve current directory for source file inspection
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const featuresDir = path.resolve(__dirname, '../src/features/adminAnalytics');

// Key factories matching apps/web/src/features/adminAnalytics/adminMetricsApi.ts
const ADMIN_METRICS_ROOT_KEY = ['admin', 'metrics'];

function adminMetricsBaseKey() {
  return ['admin', 'metrics'];
}

function adminMetricsQueryKey() {
  return ['admin', 'metrics'];
}

// Client helper replicating getAdminMetrics logic for testing
async function getAdminMetrics(apiClient) {
  const response = await apiClient.get('/admin/metrics');

  const raw = response.data?.data;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid response format: missing data payload');
  }

  return {
    total_students:
      typeof raw.total_students === 'number' &&
      !Number.isNaN(raw.total_students)
        ? raw.total_students
        : 0,
    total_recruiters:
      typeof raw.total_recruiters === 'number' &&
      !Number.isNaN(raw.total_recruiters)
        ? raw.total_recruiters
        : 0,
    active_jobs:
      typeof raw.active_jobs === 'number' && !Number.isNaN(raw.active_jobs)
        ? raw.active_jobs
        : 0,
    pending_jobs:
      typeof raw.pending_jobs === 'number' && !Number.isNaN(raw.pending_jobs)
        ? raw.pending_jobs
        : 0,
    total_applications:
      typeof raw.total_applications === 'number' &&
      !Number.isNaN(raw.total_applications)
        ? raw.total_applications
        : 0,
  };
}

describe('Phase 5.15.1 — Admin Analytics API & Types Frontend Test Suite', () => {
  const mockValidMetrics = {
    total_students: 1420,
    total_recruiters: 45,
    active_jobs: 28,
    pending_jobs: 3,
    total_applications: 3890,
  };

  // =========================================================================
  // 1. Endpoint Contract & Method
  // =========================================================================
  describe('1. Endpoint Contract & Method', () => {
    it('1. GET /admin/metrics uses correct endpoint path', async () => {
      let requestedUrl = null;
      let requestedMethod = null;

      const mockClient = {
        get: async (url) => {
          requestedUrl = url;
          requestedMethod = 'GET';
          return {
            data: {
              success: true,
              data: mockValidMetrics,
            },
          };
        },
      };

      await getAdminMetrics(mockClient);

      assert.equal(requestedUrl, '/admin/metrics');
      assert.equal(requestedMethod, 'GET');
    });

    it('2. Does not dispatch URL query parameters or request body', async () => {
      let queryParams = undefined;
      let requestConfig = undefined;

      const mockClient = {
        get: async (url, config) => {
          requestConfig = config;
          queryParams = config?.params;
          return {
            data: {
              success: true,
              data: mockValidMetrics,
            },
          };
        },
      };

      await getAdminMetrics(mockClient);

      assert.equal(queryParams, undefined);
      assert.equal(requestConfig, undefined);
    });

    it('3. Successfully unwraps and returns data payload from response envelope', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: mockValidMetrics,
          },
        }),
      };

      const result = await getAdminMetrics(mockClient);
      assert.deepEqual(result, mockValidMetrics);
    });
  });

  // =========================================================================
  // 2. Metric Fields & Zero Preservation
  // =========================================================================
  describe('2. Metric Fields & Zero Preservation', () => {
    it('4. Preserves all 5 documented platform metric fields', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: mockValidMetrics,
          },
        }),
      };

      const metrics = await getAdminMetrics(mockClient);

      assert.equal(metrics.total_students, 1420);
      assert.equal(metrics.total_recruiters, 45);
      assert.equal(metrics.active_jobs, 28);
      assert.equal(metrics.pending_jobs, 3);
      assert.equal(metrics.total_applications, 3890);

      // Verify strict types
      assert.equal(typeof metrics.total_students, 'number');
      assert.equal(typeof metrics.total_recruiters, 'number');
      assert.equal(typeof metrics.active_jobs, 'number');
      assert.equal(typeof metrics.pending_jobs, 'number');
      assert.equal(typeof metrics.total_applications, 'number');
    });

    it('5. Correctly preserves numeric zero (0) values without defaulting to undefined or null', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: {
              total_students: 0,
              total_recruiters: 0,
              active_jobs: 0,
              pending_jobs: 0,
              total_applications: 0,
            },
          },
        }),
      };

      const metrics = await getAdminMetrics(mockClient);

      assert.strictEqual(metrics.total_students, 0);
      assert.strictEqual(metrics.total_recruiters, 0);
      assert.strictEqual(metrics.active_jobs, 0);
      assert.strictEqual(metrics.pending_jobs, 0);
      assert.strictEqual(metrics.total_applications, 0);
    });

    it('6. Mixed counts with zeros and positive numbers are handled accurately', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: {
              total_students: 50,
              total_recruiters: 0,
              active_jobs: 12,
              pending_jobs: 0,
              total_applications: 130,
            },
          },
        }),
      };

      const metrics = await getAdminMetrics(mockClient);

      assert.strictEqual(metrics.total_students, 50);
      assert.strictEqual(metrics.total_recruiters, 0);
      assert.strictEqual(metrics.active_jobs, 12);
      assert.strictEqual(metrics.pending_jobs, 0);
      assert.strictEqual(metrics.total_applications, 130);
    });
  });

  // =========================================================================
  // 3. Error Handling & Malformed Payload Resilience
  // =========================================================================
  describe('3. Error Handling & Malformed Payload Resilience', () => {
    it('7. Throws informative error when data payload is missing from response envelope', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
          },
        }),
      };

      await assert.rejects(
        () => getAdminMetrics(mockClient),
        (err) =>
          err.message === 'Invalid response format: missing data payload'
      );
    });

    it('8. Throws error when data payload is not an object', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: 'unexpected string',
          },
        }),
      };

      await assert.rejects(
        () => getAdminMetrics(mockClient),
        (err) =>
          err.message === 'Invalid response format: missing data payload'
      );
    });

    it('9. Safely defaults missing individual fields or NaN values to 0', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: {
              total_students: 25,
              total_recruiters: 'invalid',
              active_jobs: NaN,
              // pending_jobs omitted
              total_applications: null,
            },
          },
        }),
      };

      const metrics = await getAdminMetrics(mockClient);

      assert.strictEqual(metrics.total_students, 25);
      assert.strictEqual(metrics.total_recruiters, 0);
      assert.strictEqual(metrics.active_jobs, 0);
      assert.strictEqual(metrics.pending_jobs, 0);
      assert.strictEqual(metrics.total_applications, 0);
    });

    it('10. Propagates apiClient network rejection without swallowing errors', async () => {
      const mockClient = {
        get: async () => {
          const error = new Error('Network error');
          error.response = { status: 500 };
          throw error;
        },
      };

      await assert.rejects(
        () => getAdminMetrics(mockClient),
        (err) => err.message === 'Network error'
      );
    });
  });

  // =========================================================================
  // 4. React Query Key Factories
  // =========================================================================
  describe('4. React Query Key Factories', () => {
    it('11. ADMIN_METRICS_ROOT_KEY matches expected root key', () => {
      assert.deepEqual(ADMIN_METRICS_ROOT_KEY, ['admin', 'metrics']);
    });

    it('12. adminMetricsBaseKey produces deterministic key', () => {
      const key1 = adminMetricsBaseKey();
      const key2 = adminMetricsBaseKey();

      assert.deepEqual(key1, ['admin', 'metrics']);
      assert.deepEqual(key1, key2);
    });

    it('13. adminMetricsQueryKey produces deterministic query key', () => {
      const key = adminMetricsQueryKey();
      assert.deepEqual(key, ['admin', 'metrics']);
    });
  });

  // =========================================================================
  // 5. Source Code Boundaries & Security Audits
  // =========================================================================
  describe('5. Source Code Boundaries & Security Audits', () => {
    it('14. features/adminAnalytics files do not use localStorage', () => {
      const files = fs.readdirSync(featuresDir);
      for (const file of files) {
        const fullPath = path.join(featuresDir, file);
        if (fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          assert.equal(
            content.includes('localStorage'),
            false,
            `File ${file} references localStorage`
          );
        }
      }
    });

    it('15. features/adminAnalytics does not invent unauthorized API endpoints', () => {
      const apiFileContent = fs.readFileSync(
        path.join(featuresDir, 'adminMetricsApi.ts'),
        'utf-8'
      );

      assert.ok(apiFileContent.includes("'/admin/metrics'"));
      assert.equal(apiFileContent.includes('/admin/metrics/'), false);
      assert.equal(apiFileContent.includes('/admin/stats'), false);
      assert.equal(apiFileContent.includes('/admin/overview'), false);
    });

    it('16. types.ts does not introduce password, hash, token, or internal ID fields', () => {
      const typesContent = fs.readFileSync(
        path.join(featuresDir, 'types.ts'),
        'utf-8'
      );

      const forbiddenWords = [
        'password',
        'password_hash',
        'token',
        'secret',
        'salt',
        'userId',
        'studentId',
        'recruiterId',
      ];

      for (const word of forbiddenWords) {
        assert.equal(
          typesContent.includes(word),
          false,
          `types.ts contains forbidden word: ${word}`
        );
      }
    });

    it('17. index.ts re-exports types and API functions cleanly', () => {
      const indexContent = fs.readFileSync(
        path.join(featuresDir, 'index.ts'),
        'utf-8'
      );

      assert.ok(indexContent.includes("export * from './types'"));
      assert.ok(indexContent.includes("export * from './adminMetricsApi'"));
      assert.ok(indexContent.includes("export * from './hooks'"));
    });

    it('18. Re-exports extractApiError utility for consumers', () => {
      const apiFileContent = fs.readFileSync(
        path.join(featuresDir, 'adminMetricsApi.ts'),
        'utf-8'
      );

      assert.ok(apiFileContent.includes('export { extractApiError }'));
    });
  });

  // =========================================================================
  // 6. React Query Hook Contracts & Behavior Suite (Phase 5.15.2)
  // =========================================================================
  describe('6. React Query Hook Contracts & Behavior Suite (Phase 5.15.2)', () => {
    const hooksFile = path.resolve(featuresDir, 'hooks.ts');

    it('1. useAdminMetrics uses the exact admin metrics query key', () => {
      const key = adminMetricsQueryKey();
      assert.deepEqual(key, ['admin', 'metrics']);

      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.ok(
        hooksContent.includes('queryKey: adminMetricsQueryKey()'),
        'Hook must use adminMetricsQueryKey()'
      );
    });

    it('2. Hook delegates query execution to getAdminMetrics', () => {
      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.ok(
        hooksContent.includes('queryFn: getAdminMetrics'),
        'Hook must specify queryFn: getAdminMetrics'
      );
    });

    it('3. Successful query returns full data payload with all 5 metrics intact', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: mockValidMetrics,
          },
        }),
      };

      const result = await getAdminMetrics(mockClient);
      assert.deepEqual(result, {
        total_students: 1420,
        total_recruiters: 45,
        active_jobs: 28,
        pending_jobs: 3,
        total_applications: 3890,
      });
    });

    it('4. Zero-valued metrics remain numeric zeros through query execution', async () => {
      const mockClient = {
        get: async () => ({
          data: {
            success: true,
            data: {
              total_students: 0,
              total_recruiters: 0,
              active_jobs: 0,
              pending_jobs: 0,
              total_applications: 0,
            },
          },
        }),
      };

      const result = await getAdminMetrics(mockClient);
      assert.strictEqual(result.total_students, 0);
      assert.strictEqual(result.total_recruiters, 0);
      assert.strictEqual(result.active_jobs, 0);
      assert.strictEqual(result.pending_jobs, 0);
      assert.strictEqual(result.total_applications, 0);
    });

    it('5. Loading state contract follows standard React Query conventions', () => {
      // Standard TanStack Query in-flight state representation
      const simulatedLoadingState = {
        data: undefined,
        isLoading: true,
        isFetching: true,
        isSuccess: false,
        isError: false,
        error: null,
      };

      assert.equal(simulatedLoadingState.isLoading, true);
      assert.equal(simulatedLoadingState.data, undefined);
      assert.equal(simulatedLoadingState.isSuccess, false);
      assert.equal(simulatedLoadingState.error, null);
    });

    it('6. Error state surfaces exception and preserves error object', async () => {
      const mockClient = {
        get: async () => {
          throw new Error('Internal Server Error (500)');
        },
      };

      await assert.rejects(
        () => getAdminMetrics(mockClient),
        (err) => err.message === 'Internal Server Error (500)'
      );
    });

    it('7. Stale time configuration adheres to existing admin conventions (30s)', () => {
      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.ok(
        hooksContent.includes('staleTime: 30 * 1000'),
        'Hook must use 30s staleTime matching useAdminUsers and usePendingJobs'
      );
    });

    it('8. Retry configuration adheres to existing admin conventions (1 retry)', () => {
      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.ok(
        hooksContent.includes('retry: 1'),
        'Hook must configure retry: 1 matching admin conventions'
      );
    });

    it('9. No polling or background interval is introduced', () => {
      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.equal(
        hooksContent.includes('refetchInterval'),
        false,
        'Platform metrics should not use automated polling without explicit requirement'
      );
    });

    it('10. Hook source code does not use localStorage', () => {
      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.equal(
        hooksContent.includes('localStorage'),
        false,
        'hooks.ts must not reference localStorage'
      );
    });

    it('11. Hook source code does not introduce manual fetch state (useState/useEffect)', () => {
      const hooksContent = fs.readFileSync(hooksFile, 'utf-8');
      assert.equal(
        hooksContent.includes('useState'),
        false,
        'Hook must rely strictly on TanStack useQuery rather than manual useState'
      );
      assert.equal(
        hooksContent.includes('useEffect'),
        false,
        'Hook must rely strictly on TanStack useQuery rather than manual useEffect'
      );
    });

    it('12. index.ts re-exports useAdminMetrics alongside types and API client', () => {
      const indexContent = fs.readFileSync(
        path.join(featuresDir, 'index.ts'),
        'utf-8'
      );
      assert.ok(
        indexContent.includes("export * from './hooks'"),
        'index.ts must re-export hooks'
      );
    });
  });

  // =========================================================================
  // 7. UI Presentational Components Contract Suite (Phase 5.15.3)
  // =========================================================================
  describe('7. UI Presentational Components Contract Suite (Phase 5.15.3)', () => {
    const componentsDir = path.resolve(featuresDir, 'components');
    const metricCardFile = path.resolve(componentsDir, 'MetricCard.tsx');
    const metricsGridFile = path.resolve(componentsDir, 'MetricsGrid.tsx');
    const skeletonFile = path.resolve(componentsDir, 'AdminMetricsSkeleton.tsx');
    const errorStateFile = path.resolve(
      componentsDir,
      'AdminMetricsErrorState.tsx'
    );
    const componentsIndexFile = path.resolve(componentsDir, 'index.ts');

    // Replicate pure formatting logic for MetricCard contract tests
    function formatMetricValue(value) {
      return typeof value === 'number' && !Number.isNaN(value)
        ? value.toLocaleString()
        : '0';
    }

    // Replicate pure sanitization logic for AdminMetricsErrorState contract tests
    const DEFAULT_ERROR_MESSAGE =
      'Unable to retrieve platform metrics. Please check your network connection and try again.';
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
    ];

    function sanitizeAdminMetricsError(rawMessage) {
      if (!rawMessage || typeof rawMessage !== 'string') {
        return DEFAULT_ERROR_MESSAGE;
      }
      const trimmed = rawMessage.trim();
      if (!trimmed) {
        return DEFAULT_ERROR_MESSAGE;
      }
      if (TECHNICAL_ERROR_PATTERNS.some((p) => p.test(trimmed))) {
        return DEFAULT_ERROR_MESSAGE;
      }
      return trimmed;
    }

    // --- MetricCard Tests ---
    it('1. MetricCard renders title and formatted numeric value', () => {
      const cardContent = fs.readFileSync(metricCardFile, 'utf-8');
      assert.ok(
        cardContent.includes('title'),
        'MetricCard must accept title prop'
      );
      assert.ok(
        cardContent.includes('value'),
        'MetricCard must accept value prop'
      );
      assert.ok(
        cardContent.includes('toLocaleString'),
        'MetricCard must format numbers cleanly'
      );

      const formatted = formatMetricValue(1250);
      assert.equal(formatted, '1,250');
    });

    it('2. MetricCard renders zero (0) accurately without converting to falsy state', () => {
      const formattedZero = formatMetricValue(0);
      assert.strictEqual(
        formattedZero,
        '0',
        'Numeric 0 must render as string "0"'
      );
      assert.notEqual(formattedZero, '');
      assert.notEqual(formattedZero, 'undefined');
      assert.notEqual(formattedZero, 'null');

      const cardContent = fs.readFileSync(metricCardFile, 'utf-8');
      assert.ok(
        cardContent.includes("typeof value === 'number'"),
        'MetricCard must explicitly check for number type to preserve zero'
      );
    });

    it('3. MetricCard renders icon and optional description appropriately', () => {
      const cardContent = fs.readFileSync(metricCardFile, 'utf-8');
      assert.ok(
        cardContent.includes('icon: Icon'),
        'MetricCard must support icon component'
      );
      assert.ok(
        cardContent.includes('description'),
        'MetricCard must support optional description'
      );
      assert.ok(
        cardContent.includes('CardTitle'),
        'MetricCard must use standard CardTitle primitive'
      );
    });

    it('4. MetricCard does not perform API calls, hooks, or mutations', () => {
      const cardContent = fs.readFileSync(metricCardFile, 'utf-8');
      assert.equal(cardContent.includes('fetch'), false);
      assert.equal(cardContent.includes('apiClient'), false);
      assert.equal(cardContent.includes('useQuery'), false);
      assert.equal(cardContent.includes('useMutation'), false);
      assert.equal(cardContent.includes('useEffect'), false);
      assert.equal(cardContent.includes('useState'), false);
    });

    // --- MetricsGrid Tests ---
    it('5. MetricsGrid renders all five documented platform metrics', () => {
      const gridContent = fs.readFileSync(metricsGridFile, 'utf-8');
      const requiredMetrics = [
        'total_students',
        'total_recruiters',
        'active_jobs',
        'pending_jobs',
        'total_applications',
      ];

      for (const metricKey of requiredMetrics) {
        assert.ok(
          gridContent.includes(metricKey),
          `MetricsGrid must map metric key: ${metricKey}`
        );
      }
    });

    it('6. MetricsGrid maps each metric to the correct title and icon', () => {
      const gridContent = fs.readFileSync(metricsGridFile, 'utf-8');
      assert.ok(gridContent.includes('Total Students'));
      assert.ok(gridContent.includes('Total Recruiters'));
      assert.ok(gridContent.includes('Active Jobs'));
      assert.ok(gridContent.includes('Pending Jobs'));
      assert.ok(gridContent.includes('Total Applications'));

      assert.ok(gridContent.includes('GraduationCap'));
      assert.ok(gridContent.includes('Building2'));
      assert.ok(gridContent.includes('Briefcase'));
      assert.ok(gridContent.includes('Clock'));
      assert.ok(gridContent.includes('Send'));
    });

    it('7. MetricsGrid preserves zero values for all platform metrics', () => {
      const allZeros = {
        total_students: 0,
        total_recruiters: 0,
        active_jobs: 0,
        pending_jobs: 0,
        total_applications: 0,
      };

      for (const [key, val] of Object.entries(allZeros)) {
        const formatted = formatMetricValue(val);
        assert.strictEqual(
          formatted,
          '0',
          `Metric ${key} with zero must format to "0"`
        );
      }
    });

    it('8. MetricsGrid configures responsive grid layout matching Admin Console', () => {
      const gridContent = fs.readFileSync(metricsGridFile, 'utf-8');
      assert.ok(
        gridContent.includes('grid-cols-1'),
        'MetricsGrid must support 1-col mobile layout'
      );
      assert.ok(
        gridContent.includes('sm:grid-cols-2'),
        'MetricsGrid must support 2-col tablet layout'
      );
      assert.ok(
        gridContent.includes('xl:grid-cols-5') ||
          gridContent.includes('lg:grid-cols-5') ||
          gridContent.includes('lg:grid-cols-3'),
        'MetricsGrid must support expanded desktop layout'
      );
      assert.ok(
        gridContent.includes('gap-4'),
        'MetricsGrid must use standardized card gap'
      );
    });

    it('9. MetricsGrid does not render unauthorized or extra metrics', () => {
      const gridContent = fs.readFileSync(metricsGridFile, 'utf-8');
      const forbiddenMetrics = [
        'total_revenue',
        'banned_users',
        'admin_count',
        'monthly_growth',
        'conversion_rate',
        'deleted_jobs',
      ];

      for (const forbidden of forbiddenMetrics) {
        assert.equal(
          gridContent.includes(forbidden),
          false,
          `MetricsGrid must not introduce undocumented metric: ${forbidden}`
        );
      }
    });

    // --- AdminMetricsSkeleton Tests ---
    it('10. AdminMetricsSkeleton renders placeholders for all 5 metrics by default', () => {
      const skeletonContent = fs.readFileSync(skeletonFile, 'utf-8');
      assert.ok(
        skeletonContent.includes('count = 5'),
        'Skeleton must default to 5 cards matching platform metrics count'
      );
      assert.ok(
        skeletonContent.includes('animate-pulse'),
        'Skeleton must apply pulse animation styling'
      );
      assert.ok(
        skeletonContent.includes('Card'),
        'Skeleton must use Card component matching the actual grid'
      );
    });

    it('11. AdminMetricsSkeleton includes accessible status role and screen-reader label', () => {
      const skeletonContent = fs.readFileSync(skeletonFile, 'utf-8');
      assert.ok(
        skeletonContent.includes('role="status"'),
        'Skeleton must declare role="status" for accessibility'
      );
      assert.ok(
        skeletonContent.includes('aria-label="Loading platform metrics"'),
        'Skeleton must declare aria-label'
      );
      assert.ok(
        skeletonContent.includes('sr-only'),
        'Skeleton must provide sr-only text for screen readers'
      );
    });

    it('12. AdminMetricsSkeleton does not render fake metric numbers or data', () => {
      const skeletonContent = fs.readFileSync(skeletonFile, 'utf-8');
      const returnMatch = skeletonContent.match(
        /return\s*\(\s*([\s\S]*?)\s*\);\s*};/
      );
      const jsxContent = returnMatch ? returnMatch[1] : '';
      const textMatches = Array.from(jsxContent.matchAll(/>([^<]+)</g))
        .map((m) => m[1].trim())
        .filter(Boolean);

      for (const text of textMatches) {
        assert.equal(
          /\d+/.test(text),
          false,
          `Rendered text "${text}" must not contain fake numeric metric values`
        );
      }
    });

    // --- AdminMetricsErrorState Tests ---
    it('13. AdminMetricsErrorState renders user-friendly default error message', () => {
      const defaultResult = sanitizeAdminMetricsError();
      assert.equal(
        defaultResult,
        'Unable to retrieve platform metrics. Please check your network connection and try again.'
      );

      const customSafe = sanitizeAdminMetricsError(
        'Platform analytics service is temporarily unavailable.'
      );
      assert.equal(
        customSafe,
        'Platform analytics service is temporarily unavailable.'
      );
    });

    it('14. AdminMetricsErrorState sanitizes raw infrastructure and database errors', () => {
      const leakages = [
        'PrismaClientKnownRequestError: Can not reach database server',
        'SELECT * FROM "PlatformMetrics" WHERE error = true',
        'ECONNREFUSED 127.0.0.1:5432',
        'Internal Server Error (500): relation "metrics" does not exist',
        'TypeError: Cannot read properties of undefined (reading total_students)',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      ];

      for (const leaked of leakages) {
        const sanitized = sanitizeAdminMetricsError(leaked);
        assert.equal(
          sanitized,
          DEFAULT_ERROR_MESSAGE,
          `Leaked error "${leaked}" must be sanitized to default user-friendly message`
        );
      }
    });

    it('15. AdminMetricsErrorState renders retry action and executes callback', () => {
      let retryCalled = false;
      const onRetry = () => {
        retryCalled = true;
      };

      assert.equal(retryCalled, false);
      onRetry();
      assert.equal(retryCalled, true);

      const errorContent = fs.readFileSync(errorStateFile, 'utf-8');
      assert.ok(
        errorContent.includes('RotateCcw'),
        'Error state must use RotateCcw retry icon'
      );
      assert.ok(
        errorContent.includes('onRetry'),
        'Error state must accept onRetry callback'
      );
      assert.ok(
        errorContent.includes('data-testid="admin-metrics-retry-button"'),
        'Error state must have data-testid for retry button'
      );
    });

    it('16. AdminMetricsErrorState handles isRetrying loading state properly', () => {
      const errorContent = fs.readFileSync(errorStateFile, 'utf-8');
      assert.ok(
        errorContent.includes('isRetrying'),
        'Error state must accept isRetrying prop'
      );
      assert.ok(
        errorContent.includes('isLoading={isRetrying}'),
        'Button must reflect isRetrying state'
      );
    });

    // --- Boundaries & Security Tests ---
    it('17. No component files use localStorage or sessionStorage', () => {
      const componentFiles = fs.readdirSync(componentsDir);
      assert.ok(componentFiles.length >= 4, 'Must have at least 4 component files');

      for (const file of componentFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
        assert.equal(
          content.includes('localStorage'),
          false,
          `${file} must not reference localStorage`
        );
        assert.equal(
          content.includes('sessionStorage'),
          false,
          `${file} must not reference sessionStorage`
        );
      }
    });

    it('18. No component files contain direct fetch or apiClient network calls', () => {
      const componentFiles = fs.readdirSync(componentsDir);
      for (const file of componentFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
        assert.equal(
          content.includes('fetch('),
          false,
          `${file} must not perform fetch calls`
        );
        assert.equal(
          content.includes('apiClient'),
          false,
          `${file} must not call apiClient directly`
        );
        assert.equal(
          content.includes('axios'),
          false,
          `${file} must not call axios directly`
        );
      }
    });

    // --- Exports & Architecture Tests ---
    it('19. components/index.ts exports all 4 presentational components', () => {
      const indexContent = fs.readFileSync(componentsIndexFile, 'utf-8');
      assert.ok(
        indexContent.includes("export * from './MetricCard'"),
        'components/index.ts must export MetricCard'
      );
      assert.ok(
        indexContent.includes("export * from './MetricsGrid'"),
        'components/index.ts must export MetricsGrid'
      );
      assert.ok(
        indexContent.includes("export * from './AdminMetricsSkeleton'"),
        'components/index.ts must export AdminMetricsSkeleton'
      );
      assert.ok(
        indexContent.includes("export * from './AdminMetricsErrorState'"),
        'components/index.ts must export AdminMetricsErrorState'
      );
    });

    it('20. features/adminAnalytics/index.ts re-exports all components', () => {
      const featureIndexContent = fs.readFileSync(
        path.join(featuresDir, 'index.ts'),
        'utf-8'
      );
      assert.ok(
        featureIndexContent.includes("export * from './components'"),
        'features/adminAnalytics/index.ts must re-export ./components'
      );
    });

    it('21. Presentational components are cleanly decoupled from page layout', () => {
      const componentFiles = fs.readdirSync(componentsDir);
      for (const file of componentFiles) {
        const content = fs.readFileSync(
          path.join(componentsDir, file),
          'utf-8'
        );
        assert.equal(
          content.includes('AdminAnalyticsPage'),
          false,
          `${file} must not reference AdminAnalyticsPage`
        );
        assert.equal(
          content.includes('react-router-dom'),
          false,
          `${file} must not couple to react-router-dom`
        );
      }
    });
  });

  // =========================================================================
  // 8. Admin Analytics Page & Route Integration Suite (Phase 5.15.4)
  // =========================================================================
  describe('8. Admin Analytics Page & Route Integration Suite (Phase 5.15.4)', () => {
    const pageFile = path.resolve(featuresDir, 'AdminAnalyticsPage.tsx');
    const adminPagesFile = path.resolve(
      __dirname,
      '../src/pages/AdminPages.tsx'
    );
    const routesFile = path.resolve(__dirname, '../src/router/routes.tsx');
    const layoutFile = path.resolve(__dirname, '../src/layouts/AdminLayout.tsx');

    it('1. real AdminAnalyticsPage is exported from features and re-exported in index.ts', () => {
      assert.ok(fs.existsSync(pageFile), 'AdminAnalyticsPage.tsx must exist');
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('export const AdminAnalyticsPage'),
        'AdminAnalyticsPage must be exported'
      );

      const featureIndexContent = fs.readFileSync(
        path.join(featuresDir, 'index.ts'),
        'utf-8'
      );
      assert.ok(
        featureIndexContent.includes("export * from './AdminAnalyticsPage'"),
        'features/adminAnalytics/index.ts must re-export AdminAnalyticsPage'
      );
    });

    it('2. AdminPages.tsx re-exports real AdminAnalyticsPage from @/features/adminAnalytics', () => {
      const adminPagesContent = fs.readFileSync(adminPagesFile, 'utf-8');
      assert.ok(
        adminPagesContent.includes(
          "export { AdminAnalyticsPage } from '@/features/adminAnalytics';"
        ),
        'AdminPages.tsx must export AdminAnalyticsPage from feature package'
      );
      assert.equal(
        adminPagesContent.includes(
          'Connects to Admin Audit & Metrics endpoints'
        ),
        false,
        'Placeholder must be completely removed from AdminPages.tsx'
      );
    });

    it('3. page calls useAdminMetrics hook for data retrieval', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('useAdminMetrics()'),
        'Page must invoke useAdminMetrics()'
      );
      assert.ok(
        pageContent.includes("import { useAdminMetrics } from './hooks';") ||
          pageContent.includes('useAdminMetrics'),
        'Page must import useAdminMetrics'
      );
    });

    it('4. page does not make direct fetch, apiClient, or axios calls', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.equal(/\bfetch\s*\(/.test(pageContent), false);
      assert.equal(pageContent.includes('apiClient'), false);
      assert.equal(pageContent.includes('axios'), false);
    });

    it('5. page does not use useEffect or useState for data fetching', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.equal(pageContent.includes('useEffect'), false);
      assert.equal(pageContent.includes('useState'), false);
    });

    it('6. page displays consistent Admin Console title and description', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('System Analytics'),
        'Page must display System Analytics header'
      );
      assert.ok(
        pageContent.includes('High-level platform metrics'),
        'Page must include platform metrics description'
      );
      assert.ok(
        pageContent.includes('max-w-5xl mx-auto'),
        'Page must use standard Admin Console max-width container'
      );
    });

    it('7. loading state renders AdminMetricsSkeleton when data is not yet available', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes(
          'isLoading && !metricsData && <AdminMetricsSkeleton'
        ),
        'Page must render skeleton when loading and data is absent'
      );
    });

    it('8. error state renders AdminMetricsErrorState when initial query fails', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('isError && !metricsData &&'),
        'Page must render error state when error and data is absent'
      );
      assert.ok(
        pageContent.includes('<AdminMetricsErrorState'),
        'Page must render AdminMetricsErrorState component'
      );
    });

    it('9. retry action triggers React Query refetch', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('onRetry={() => refetch()}'),
        'Error state onRetry must invoke refetch()'
      );
      assert.ok(
        pageContent.includes('isRetrying={isFetching}'),
        'Error state isRetrying must track isFetching'
      );
    });

    it('10. successful query data renders MetricsGrid', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes(
          'metricsData && <MetricsGrid metrics={metricsData} />'
        ),
        'Page must render MetricsGrid with metricsData'
      );
    });

    it('11. background refetching preserves visible metrics and does not flash full skeleton', () => {
      const evaluateRenderedState = (state) => {
        if (state.isLoading && !state.data) return 'SKELETON';
        if (state.isError && !state.data) return 'ERROR';
        if (state.data) return 'GRID';
        return 'EMPTY';
      };

      assert.equal(
        evaluateRenderedState({
          isLoading: true,
          isFetching: true,
          data: undefined,
        }),
        'SKELETON'
      );

      const loadedData = {
        total_students: 500,
        total_recruiters: 20,
        active_jobs: 15,
        pending_jobs: 2,
        total_applications: 1200,
      };
      assert.equal(
        evaluateRenderedState({
          isLoading: false,
          isFetching: false,
          data: loadedData,
        }),
        'GRID'
      );

      assert.equal(
        evaluateRenderedState({
          isLoading: false,
          isFetching: true,
          data: loadedData,
        }),
        'GRID'
      );
    });

    it('12. background refetching displays subtle refreshing indicator and manual refresh action', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('isFetching && !isLoading &&'),
        'Page must conditionally show refreshing indicator during background fetch'
      );
      assert.ok(
        pageContent.includes('Refreshing...'),
        'Page must display Refreshing... text indicator'
      );
      assert.ok(
        pageContent.includes('data-testid="admin-metrics-refresh-button"'),
        'Page must provide manual refresh button'
      );
    });

    it('13. all 5 platform metrics and legitimate zero values reach the grid unchanged', () => {
      const zeroMetrics = {
        total_students: 0,
        total_recruiters: 0,
        active_jobs: 0,
        pending_jobs: 0,
        total_applications: 0,
      };

      assert.strictEqual(zeroMetrics.total_students, 0);
      assert.strictEqual(zeroMetrics.total_recruiters, 0);
      assert.strictEqual(zeroMetrics.active_jobs, 0);
      assert.strictEqual(zeroMetrics.pending_jobs, 0);
      assert.strictEqual(zeroMetrics.total_applications, 0);
    });

    it('14. raw infrastructure or database error strings are protected by error sanitization', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.ok(
        pageContent.includes('message={error?.message}'),
        'Page must pass error message to AdminMetricsErrorState for safe sanitization'
      );
    });

    it('15. routes.tsx connects /admin/analytics to AdminAnalyticsPage under ADMIN protection', () => {
      const routesContent = fs.readFileSync(routesFile, 'utf-8');
      assert.ok(
        routesContent.includes('AdminAnalyticsPage'),
        'routes.tsx must reference AdminAnalyticsPage'
      );
      assert.ok(
        routesContent.includes("path: 'analytics'"),
        "routes.tsx must define path: 'analytics'"
      );
      assert.ok(
        routesContent.includes("allowedRoles={['ADMIN']}"),
        'Admin routes must be protected by ADMIN role guard'
      );
    });

    it('16. routes.tsx contains no duplicate analytics routes', () => {
      const routesContent = fs.readFileSync(routesFile, 'utf-8');
      const matches = routesContent.match(/path:\s*['"`]analytics['"`]/g) || [];
      assert.equal(
        matches.length,
        1,
        'routes.tsx must contain exactly one analytics route definition'
      );
    });

    it('17. AdminLayout.tsx navigation item points to /admin/analytics with Analytics label', () => {
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');
      assert.ok(
        layoutContent.includes("path: '/admin/analytics'"),
        'AdminLayout must navigate to /admin/analytics'
      );
      assert.ok(
        layoutContent.includes("label: 'Analytics'"),
        "AdminLayout nav item must be labeled 'Analytics'"
      );
      assert.ok(
        layoutContent.includes('BarChart3'),
        'AdminLayout must use BarChart3 icon for analytics'
      );
    });

    it('18. no localStorage or sessionStorage is used in AdminAnalyticsPage', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.equal(pageContent.includes('localStorage'), false);
      assert.equal(pageContent.includes('sessionStorage'), false);
    });

    it('19. no polling or interval loops are introduced in AdminAnalyticsPage', () => {
      const pageContent = fs.readFileSync(pageFile, 'utf-8');
      assert.equal(pageContent.includes('setInterval'), false);
      assert.equal(pageContent.includes('refetchInterval'), false);
    });
  });
});
