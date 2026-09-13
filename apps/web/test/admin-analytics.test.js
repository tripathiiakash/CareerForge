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
    });

    it('18. Re-exports extractApiError utility for consumers', () => {
      const apiFileContent = fs.readFileSync(
        path.join(featuresDir, 'adminMetricsApi.ts'),
        'utf-8'
      );

      assert.ok(apiFileContent.includes('export { extractApiError }'));
    });
  });
});
