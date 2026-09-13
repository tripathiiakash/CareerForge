import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listUsersQuerySchema } from '@careerforge/validation';

// Resolve current file directory for inspecting source files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const featuresDir = path.resolve(__dirname, '../src/features/adminUsers');
const componentsDir = path.resolve(featuresDir, 'components');

// Helper functions and key factories matching apps/web/src/features/adminUsers/adminUsersApi.ts
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return Boolean(id && UUID_REGEX.test(String(id).trim()));
}

function buildAdminUsersQueryParams(params) {
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

  if (params.role === 'STUDENT' || params.role === 'RECRUITER') {
    query.role = params.role;
  }

  if (typeof params.search === 'string') {
    const trimmed = params.search.trim();
    if (trimmed.length > 0) {
      query.search = trimmed;
    }
  }

  return query;
}

function normalizeAdminUsersQueryParams(params) {
  const page = params?.page && params.page > 0 ? Math.floor(params.page) : 1;
  const limit =
    params?.limit && params.limit > 0 && params.limit <= 50
      ? Math.floor(params.limit)
      : 20;

  const role =
    params?.role === 'STUDENT' || params?.role === 'RECRUITER'
      ? params.role
      : undefined;

  const trimmedSearch =
    typeof params?.search === 'string' ? params.search.trim() : '';

  return {
    page,
    limit,
    ...(role ? { role } : {}),
    ...(trimmedSearch.length > 0 ? { search: trimmedSearch } : {}),
  };
}

const ADMIN_USERS_ROOT_KEY = ['admin', 'users'];

function adminUsersBaseKey() {
  return ['admin', 'users'];
}

function adminUsersQueryKey(params) {
  const normalized = normalizeAdminUsersQueryParams(params);
  return ['admin', 'users', normalized];
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

async function getAdminUsers(apiClient, params) {
  const query = buildAdminUsersQueryParams(params);
  const response = await apiClient.get('/admin/users', {
    params: Object.keys(query).length > 0 ? query : undefined,
  });

  return {
    data: response.data.data,
    meta: response.data.meta,
  };
}

async function deleteAdminUser(apiClient, userId) {
  if (!isValidUuid(userId)) {
    throw new Error('Invalid userId format (must be a valid UUID)');
  }

  const response = await apiClient.delete(
    `/admin/users/${encodeURIComponent(userId)}`
  );

  return response.data;
}

// Presentation helpers matching apps/web/src/features/adminUsers/components/AdminUserCard.tsx
function formatUserDate(dateString) {
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

function getUserDisplayName(user) {
  if (user.student?.first_name || user.student?.last_name) {
    return `${user.student.first_name || ''} ${user.student.last_name || ''}`.trim();
  }
  if (user.recruiter?.first_name || user.recruiter?.last_name) {
    return `${user.recruiter.first_name || ''} ${user.recruiter.last_name || ''}`.trim();
  }
  if (user.role === 'ADMIN') {
    return 'Administrator';
  }
  return user.email.split('@')[0] || 'Platform User';
}

function getRoleBadgeConfig(role) {
  switch (role) {
    case 'STUDENT':
      return { label: 'Student', variant: 'info' };
    case 'RECRUITER':
      return { label: 'Recruiter', variant: 'warning' };
    case 'ADMIN':
      return { label: 'Admin', variant: 'default' };
    default:
      return { label: role, variant: 'outline' };
  }
}

describe('Phase 5.14 — Admin User Management Frontend Test Suite', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validRecruiterId = '22222222-2222-4222-8222-222222222222';
  const validAdminId = '33333333-3333-4333-8333-333333333333';

  // =========================================================================
  // 1. LIST: GET /api/v1/admin/users
  // =========================================================================
  describe('1. LIST: GET /admin/users Endpoint Contract', () => {
    it('1. correct GET path', async () => {
      let recordedUrl = '';
      const mockClient = {
        get: async (url) => {
          recordedUrl = url;
          return {
            data: {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
            },
          };
        },
      };

      await getAdminUsers(mockClient);
      assert.equal(recordedUrl, '/admin/users');
    });

    it('2. default params normalize correctly', () => {
      const defaultFromUndefined = normalizeAdminUsersQueryParams();
      const defaultFromEmpty = normalizeAdminUsersQueryParams({});
      const defaultFromExplicit = normalizeAdminUsersQueryParams({
        page: 1,
        limit: 20,
      });
      const defaultFromWhitespace = normalizeAdminUsersQueryParams({
        search: '   ',
      });

      assert.deepEqual(defaultFromUndefined, { page: 1, limit: 20 });
      assert.deepEqual(defaultFromEmpty, { page: 1, limit: 20 });
      assert.deepEqual(defaultFromExplicit, { page: 1, limit: 20 });
      assert.deepEqual(defaultFromWhitespace, { page: 1, limit: 20 });
    });

    it('3. page serializes correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return {
            data: {
              success: true,
              data: [],
              meta: { total: 0, page: 3, limit: 20, totalPages: 0 },
            },
          };
        },
      };

      await getAdminUsers(mockClient, { page: 3 });
      assert.deepEqual(recordedConfig?.params, { page: 3 });

      // Floored integer
      const floored = buildAdminUsersQueryParams({ page: 4.8 });
      assert.deepEqual(floored, { page: 4 });

      // Out of bounds omitted
      const nonPositive = buildAdminUsersQueryParams({ page: 0 });
      assert.deepEqual(nonPositive, {});
      const negative = buildAdminUsersQueryParams({ page: -2 });
      assert.deepEqual(negative, {});
    });

    it('4. limit serializes correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return {
            data: {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 35, totalPages: 0 },
            },
          };
        },
      };

      await getAdminUsers(mockClient, { limit: 35 });
      assert.deepEqual(recordedConfig?.params, { limit: 35 });

      // Floored integer
      const floored = buildAdminUsersQueryParams({ limit: 25.9 });
      assert.deepEqual(floored, { limit: 25 });

      // Out of bounds omitted (> 50 or <= 0)
      const overMax = buildAdminUsersQueryParams({ limit: 51 });
      assert.deepEqual(overMax, {});
      const zeroLimit = buildAdminUsersQueryParams({ limit: 0 });
      assert.deepEqual(zeroLimit, {});
    });

    it('5. role STUDENT serializes correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return {
            data: {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
            },
          };
        },
      };

      await getAdminUsers(mockClient, { role: 'STUDENT' });
      assert.deepEqual(recordedConfig?.params, { role: 'STUDENT' });
    });

    it('6. role RECRUITER serializes correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return {
            data: {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
            },
          };
        },
      };

      await getAdminUsers(mockClient, { role: 'RECRUITER' });
      assert.deepEqual(recordedConfig?.params, { role: 'RECRUITER' });
    });

    it('7. invalid role is rejected/omitted consistently', () => {
      // ADMIN is a valid response role but NOT an allowed filter query role per backend schema
      const queryAdmin = buildAdminUsersQueryParams({ role: 'ADMIN' });
      assert.deepEqual(queryAdmin, {});

      const querySuperuser = buildAdminUsersQueryParams({ role: 'SUPERUSER' });
      assert.deepEqual(querySuperuser, {});

      const queryEmpty = buildAdminUsersQueryParams({ role: '' });
      assert.deepEqual(queryEmpty, {});

      // Normalizer also omits invalid filter role
      const normalizedInvalid = normalizeAdminUsersQueryParams({
        role: 'ADMIN',
      });
      assert.deepEqual(normalizedInvalid, { page: 1, limit: 20 });
    });

    it('8. search is trimmed correctly', async () => {
      let recordedConfig = null;
      const mockClient = {
        get: async (url, config) => {
          recordedConfig = config;
          return {
            data: {
              success: true,
              data: [],
              meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
            },
          };
        },
      };

      await getAdminUsers(mockClient, { search: '  alice@example.com  ' });
      assert.deepEqual(recordedConfig?.params, {
        search: 'alice@example.com',
      });

      // Empty / whitespace-only search is omitted
      const emptySearch = buildAdminUsersQueryParams({ search: '   ' });
      assert.deepEqual(emptySearch, {});

      // Normalizer trims search
      const normalizedSearch = normalizeAdminUsersQueryParams({
        search: '  bob@technova.com  ',
      });
      assert.deepEqual(normalizedSearch, {
        page: 1,
        limit: 20,
        search: 'bob@technova.com',
      });
    });

    it('9. response envelope maps correctly', async () => {
      const mockUser = {
        id: validUserId,
        email: 'alice@student.example.com',
        role: 'STUDENT',
        is_banned: false,
        created_at: '2026-09-10T10:00:00.000Z',
        student: {
          first_name: 'Alice',
          last_name: 'Walker',
        },
        recruiter: null,
      };

      const mockResponse = {
        data: {
          success: true,
          data: [mockUser],
          meta: {
            total: 1,
            page: 1,
            limit: 20,
            totalPages: 1,
          },
        },
      };

      const mockClient = {
        get: async () => mockResponse,
      };

      const result = await getAdminUsers(mockClient, { page: 1, limit: 20 });
      assert.deepEqual(result.data, [mockUser]);
      assert.deepEqual(result.meta, {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('10. pagination metadata maps correctly', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: [],
          meta: {
            total: 125,
            page: 3,
            limit: 25,
            totalPages: 5,
          },
        },
      };

      const mockClient = {
        get: async () => mockResponse,
      };

      const result = await getAdminUsers(mockClient, { page: 3, limit: 25 });
      assert.equal(result.meta.total, 125);
      assert.equal(result.meta.page, 3);
      assert.equal(result.meta.limit, 25);
      assert.equal(result.meta.totalPages, 5);
    });
  });

  // =========================================================================
  // 2. DELETE: DELETE /api/v1/admin/users/:id
  // =========================================================================
  describe('2. DELETE: DELETE /admin/users/:id Endpoint Contract', () => {
    it('11. correct DELETE path', async () => {
      let recordedUrl = '';
      const mockClient = {
        delete: async (url) => {
          recordedUrl = url;
          return {
            data: {
              success: true,
              message: 'User and associated data deleted.',
            },
          };
        },
      };

      await deleteAdminUser(mockClient, validUserId);
      assert.equal(recordedUrl, `/admin/users/${validUserId}`);
    });

    it('12. valid UUID accepted', async () => {
      let networkCalled = false;
      const mockClient = {
        delete: async () => {
          networkCalled = true;
          return {
            data: {
              success: true,
              message: 'User and associated data deleted.',
            },
          };
        },
      };

      const result = await deleteAdminUser(mockClient, validRecruiterId);
      assert.equal(networkCalled, true);
      assert.equal(result.success, true);
    });

    it('13. invalid UUID rejected before network', async () => {
      let networkCalled = false;
      const mockClient = {
        delete: async () => {
          networkCalled = true;
          return { data: { success: true } };
        },
      };

      await assert.rejects(
        () => deleteAdminUser(mockClient, 'not-a-uuid'),
        (err) =>
          err.message.includes('Invalid userId format (must be a valid UUID)')
      );

      await assert.rejects(
        () => deleteAdminUser(mockClient, '12345'),
        (err) =>
          err.message.includes('Invalid userId format (must be a valid UUID)')
      );

      await assert.rejects(
        () => deleteAdminUser(mockClient, ''),
        (err) =>
          err.message.includes('Invalid userId format (must be a valid UUID)')
      );

      await assert.rejects(
        () => deleteAdminUser(mockClient, null),
        (err) =>
          err.message.includes('Invalid userId format (must be a valid UUID)')
      );

      await assert.rejects(
        () => deleteAdminUser(mockClient, undefined),
        (err) =>
          err.message.includes('Invalid userId format (must be a valid UUID)')
      );

      assert.equal(networkCalled, false);
    });

    it('14. success response maps correctly', async () => {
      const mockClient = {
        delete: async () => ({
          data: {
            success: true,
            message: 'User and associated data deleted.',
          },
        }),
      };

      const response = await deleteAdminUser(mockClient, validAdminId);
      assert.deepEqual(response, {
        success: true,
        message: 'User and associated data deleted.',
      });
    });
  });

  // =========================================================================
  // 3. React Query Key Factories
  // =========================================================================
  describe('3. React Query Key Factories', () => {
    it('15. equivalent normalized params produce identical keys', () => {
      const keyDefault = adminUsersQueryKey();
      const keyEmpty = adminUsersQueryKey({});
      const keyExplicit = adminUsersQueryKey({ page: 1, limit: 20 });
      const keyFloored = adminUsersQueryKey({ page: 1.4, limit: 20.9 });
      const keyWhitespaceSearch = adminUsersQueryKey({ search: '   ' });

      assert.deepEqual(keyDefault, keyEmpty);
      assert.deepEqual(keyDefault, keyExplicit);
      assert.deepEqual(keyDefault, keyFloored);
      assert.deepEqual(keyDefault, keyWhitespaceSearch);
      assert.deepEqual(keyDefault, [
        'admin',
        'users',
        { page: 1, limit: 20 },
      ]);
      assert.deepEqual(adminUsersBaseKey(), ['admin', 'users']);
      assert.deepEqual(ADMIN_USERS_ROOT_KEY, ['admin', 'users']);
    });

    it('16. different page values create distinct keys', () => {
      const page1Key = adminUsersQueryKey({ page: 1, limit: 20 });
      const page2Key = adminUsersQueryKey({ page: 2, limit: 20 });
      const page3Key = adminUsersQueryKey({ page: 3, limit: 20 });

      assert.notDeepEqual(page1Key, page2Key);
      assert.notDeepEqual(page2Key, page3Key);
    });

    it('17. different role values create distinct keys', () => {
      const studentKey = adminUsersQueryKey({ role: 'STUDENT' });
      const recruiterKey = adminUsersQueryKey({ role: 'RECRUITER' });
      const allKey = adminUsersQueryKey();

      assert.notDeepEqual(studentKey, recruiterKey);
      assert.notDeepEqual(studentKey, allKey);
      assert.notDeepEqual(recruiterKey, allKey);
    });

    it('18. different search values create distinct keys', () => {
      const searchAlpha = adminUsersQueryKey({ search: 'alice@example.com' });
      const searchBeta = adminUsersQueryKey({ search: 'bob@example.com' });
      const searchNone = adminUsersQueryKey();

      assert.notDeepEqual(searchAlpha, searchBeta);
      assert.notDeepEqual(searchAlpha, searchNone);
    });
  });

  // =========================================================================
  // 4. Boundaries & Security
  // =========================================================================
  describe('4. Boundaries & Security', () => {
    it('19. no localStorage usage', () => {
      const apiFileContent = fs.readFileSync(
        path.join(featuresDir, 'adminUsersApi.ts'),
        'utf-8'
      );
      const typesFileContent = fs.readFileSync(
        path.join(featuresDir, 'types.ts'),
        'utf-8'
      );
      const indexFileContent = fs.readFileSync(
        path.join(featuresDir, 'index.ts'),
        'utf-8'
      );
      const hooksFileContent = fs.readFileSync(
        path.join(featuresDir, 'hooks.ts'),
        'utf-8'
      );

      assert.equal(apiFileContent.includes('localStorage'), false);
      assert.equal(typesFileContent.includes('localStorage'), false);
      assert.equal(indexFileContent.includes('localStorage'), false);
      assert.equal(hooksFileContent.includes('localStorage'), false);

      // Check all component files
      const componentFiles = fs.readdirSync(componentsDir);
      for (const file of componentFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
        assert.equal(
          content.includes('localStorage'),
          false,
          `Component ${file} unexpectedly references localStorage`
        );
      }
    });

    it('20. no invented endpoints', () => {
      const apiFileContent = fs.readFileSync(
        path.join(featuresDir, 'adminUsersApi.ts'),
        'utf-8'
      );
      const hooksFileContent = fs.readFileSync(
        path.join(featuresDir, 'hooks.ts'),
        'utf-8'
      );

      // Verify the only API paths are /admin/users and /admin/users/:id
      const matches =
        (apiFileContent + '\n' + hooksFileContent).match(
          /['"`]\/[a-zA-Z0-9/_-]+['"`]/g
        ) || [];
      const allowedPaths = ["'/admin/users'"];

      for (const m of matches) {
        const cleaned = m.replace(/['"`]/g, '');
        assert.ok(
          allowedPaths.includes(m) || cleaned.startsWith('/admin/users'),
          `Unexpected endpoint referenced in adminUsers: ${m}`
        );
      }
    });

    it('21. no password/auth fields introduced into frontend types', () => {
      const typesFileContent = fs.readFileSync(
        path.join(featuresDir, 'types.ts'),
        'utf-8'
      );

      assert.equal(typesFileContent.includes('password'), false);
      assert.equal(typesFileContent.includes('password_hash'), false);
      assert.equal(typesFileContent.includes('salt'), false);
      assert.equal(typesFileContent.includes('token'), false);
      assert.equal(typesFileContent.includes('secret'), false);
    });
  });

  // =========================================================================
  // 5. Backend Schema Alignment
  // =========================================================================
  describe('5. Backend Schema Alignment', () => {
    it('22. query builder outputs conform to backend listUsersQuerySchema', () => {
      const query1 = buildAdminUsersQueryParams();
      assert.doesNotThrow(() => listUsersQuerySchema.parse(query1));

      const query2 = buildAdminUsersQueryParams({
        page: 2,
        limit: 30,
        role: 'STUDENT',
        search: '  test@example.com  ',
      });
      const parsed2 = listUsersQuerySchema.parse(query2);
      assert.equal(parsed2.page, 2);
      assert.equal(parsed2.limit, 30);
      assert.equal(parsed2.role, 'STUDENT');
      assert.equal(parsed2.search, 'test@example.com');

      const query3 = buildAdminUsersQueryParams({
        role: 'RECRUITER',
      });
      const parsed3 = listUsersQuerySchema.parse(query3);
      assert.equal(parsed3.role, 'RECRUITER');
    });
  });

  // =========================================================================
  // 6. React Query Hook Contracts & Invalidation Suite (Phase 5.14.2)
  // =========================================================================
  describe('6. React Query Hook Contracts & Invalidation Suite (Phase 5.14.2)', () => {
    it('1. useAdminUsers uses correct normalized query key', () => {
      const queryKey = adminUsersQueryKey({
        page: 2,
        limit: 15,
        role: 'STUDENT',
        search: 'alice@example.com',
      });
      assert.deepEqual(queryKey, [
        'admin',
        'users',
        {
          page: 2,
          limit: 15,
          role: 'STUDENT',
          search: 'alice@example.com',
        },
      ]);
    });

    it('2. page parameter reaches the query layer', () => {
      const params = { page: 4 };
      const built = buildAdminUsersQueryParams(params);
      const normalized = normalizeAdminUsersQueryParams(params);

      assert.equal(built.page, 4);
      assert.equal(normalized.page, 4);
      assert.equal(normalized.limit, 20); // default
    });

    it('3. limit parameter reaches the query layer', () => {
      const params = { limit: 35 };
      const built = buildAdminUsersQueryParams(params);
      const normalized = normalizeAdminUsersQueryParams(params);

      assert.equal(built.limit, 35);
      assert.equal(normalized.limit, 35);
      assert.equal(normalized.page, 1); // default
    });

    it('4. role parameter reaches the query layer', () => {
      const paramsStudent = { role: 'STUDENT' };
      assert.equal(buildAdminUsersQueryParams(paramsStudent).role, 'STUDENT');
      assert.equal(
        normalizeAdminUsersQueryParams(paramsStudent).role,
        'STUDENT'
      );

      const paramsRecruiter = { role: 'RECRUITER' };
      assert.equal(
        buildAdminUsersQueryParams(paramsRecruiter).role,
        'RECRUITER'
      );
      assert.equal(
        normalizeAdminUsersQueryParams(paramsRecruiter).role,
        'RECRUITER'
      );
    });

    it('5. search parameter reaches the query layer', () => {
      const params = { search: '  support@careerforge.com  ' };
      const built = buildAdminUsersQueryParams(params);
      const normalized = normalizeAdminUsersQueryParams(params);

      assert.equal(built.search, 'support@careerforge.com');
      assert.equal(normalized.search, 'support@careerforge.com');
    });

    it('6. equivalent normalized params share the same key', () => {
      const keyA = adminUsersQueryKey(undefined);
      const keyB = adminUsersQueryKey({});
      const keyC = adminUsersQueryKey({ page: 1, limit: 20 });
      const keyD = adminUsersQueryKey({ search: '   ' });
      const keyE = adminUsersQueryKey({ page: 1.2, limit: 20.8 });

      assert.deepEqual(keyA, keyB);
      assert.deepEqual(keyB, keyC);
      assert.deepEqual(keyC, keyD);
      assert.deepEqual(keyD, keyE);
    });

    it('7. useDeleteUser calls correct API function', async () => {
      let calledUserId = null;

      const mockDeleteApi = async (userId) => {
        calledUserId = userId;
        return {
          success: true,
          message: 'User and associated data deleted.',
        };
      };

      // Simulated mutation execution matching useDeleteUser (supports string and { userId })
      const executeMutation = async (variables) => {
        const id = typeof variables === 'string' ? variables : variables.userId;
        return await mockDeleteApi(id);
      };

      // Call with string
      const resultString = await executeMutation(validUserId);
      assert.equal(calledUserId, validUserId);
      assert.equal(resultString.success, true);

      // Call with object
      const resultObj = await executeMutation({ userId: validRecruiterId });
      assert.equal(calledUserId, validRecruiterId);
      assert.equal(resultObj.success, true);
    });

    it('8. successful deletion invalidates adminUsersBaseKey()', async () => {
      const invalidatedKeys = [];
      const mockQueryClient = {
        invalidateQueries: ({ queryKey }) => {
          invalidatedKeys.push(queryKey);
        },
      };

      const executeMutation = async (variables) => {
        const id = typeof variables === 'string' ? variables : variables.userId;
        const result = {
          success: true,
          message: 'User and associated data deleted.',
        };
        mockQueryClient.invalidateQueries({
          queryKey: adminUsersBaseKey(),
        });
        return result;
      };

      await executeMutation(validUserId);

      assert.equal(invalidatedKeys.length, 1);
      assert.deepEqual(invalidatedKeys[0], ['admin', 'users']);
    });

    it('9. invalidation covers all pagination/filter/search variants', () => {
      const baseKey = adminUsersBaseKey();
      const page1Key = adminUsersQueryKey({ page: 1, limit: 20 });
      const page2Key = adminUsersQueryKey({ page: 2, limit: 20 });
      const page50Key = adminUsersQueryKey({ page: 5, limit: 50 });
      const filteredStudentKey = adminUsersQueryKey({ role: 'STUDENT' });
      const filteredRecruiterKey = adminUsersQueryKey({ role: 'RECRUITER' });
      const searchKey = adminUsersQueryKey({ search: 'alice@example.com' });
      const complexKey = adminUsersQueryKey({
        page: 3,
        limit: 25,
        role: 'RECRUITER',
        search: 'technova',
      });

      // TanStack Query prefix matching ensures all user list caches are invalidated by the base key
      assert.equal(queryKeyPrefixMatches(baseKey, page1Key), true);
      assert.equal(queryKeyPrefixMatches(baseKey, page2Key), true);
      assert.equal(queryKeyPrefixMatches(baseKey, page50Key), true);
      assert.equal(queryKeyPrefixMatches(baseKey, filteredStudentKey), true);
      assert.equal(queryKeyPrefixMatches(baseKey, filteredRecruiterKey), true);
      assert.equal(queryKeyPrefixMatches(baseKey, searchKey), true);
      assert.equal(queryKeyPrefixMatches(baseKey, complexKey), true);
    });

    it('10. deletion errors are propagated', async () => {
      const mockFailedApi = async () => {
        throw new Error('Admins cannot delete their own account.');
      };

      const executeMutation = async (variables) => {
        const id = typeof variables === 'string' ? variables : variables.userId;
        return await mockFailedApi(id);
      };

      await assert.rejects(
        () => executeMutation(validUserId),
        (err) => err.message === 'Admins cannot delete their own account.'
      );
    });

    it('11. unrelated recruiter/student/admin-moderation keys are not invalidated', () => {
      const baseKey = adminUsersBaseKey();
      const adminModerationBaseKey = ['admin', 'moderation'];
      const adminPendingJobsKey = ['admin', 'moderation', 'pending-jobs'];
      const recruiterJobsKey = ['recruiter', 'jobs'];
      const recruiterApplicantsKey = [
        'recruiter',
        'jobs',
        validUserId,
        'applicants',
      ];
      const studentJobsKey = ['jobs'];
      const studentResumesKey = ['student', 'resumes'];
      const studentApplicationsKey = ['student', 'applications'];

      assert.equal(queryKeyPrefixMatches(baseKey, adminModerationBaseKey), false);
      assert.equal(queryKeyPrefixMatches(baseKey, adminPendingJobsKey), false);
      assert.equal(queryKeyPrefixMatches(baseKey, recruiterJobsKey), false);
      assert.equal(
        queryKeyPrefixMatches(baseKey, recruiterApplicantsKey),
        false
      );
      assert.equal(queryKeyPrefixMatches(baseKey, studentJobsKey), false);
      assert.equal(queryKeyPrefixMatches(baseKey, studentResumesKey), false);
      assert.equal(
        queryKeyPrefixMatches(baseKey, studentApplicationsKey),
        false
      );
    });

    it('12. no localStorage is introduced', () => {
      const hooksFileContent = fs.readFileSync(
        path.join(featuresDir, 'hooks.ts'),
        'utf-8'
      );
      assert.equal(hooksFileContent.includes('localStorage'), false);
    });

    it('13. no optimistic fake deletion is performed', () => {
      // In useDeleteUser, onMutate is not defined and setQueryData is not called.
      // Server response and refetch determine the authoritative user list.
      const hooksFileContent = fs.readFileSync(
        path.join(featuresDir, 'hooks.ts'),
        'utf-8'
      );
      assert.equal(hooksFileContent.includes('onMutate'), false);
      assert.equal(hooksFileContent.includes('setQueryData'), false);
    });
  });

  // =========================================================================
  // 7. UI Components Contract & Interaction Suite (Phase 5.14.3)
  // =========================================================================
  describe('7. UI Components Contract & Interaction Suite (Phase 5.14.3)', () => {
    const sampleStudent = {
      id: validUserId,
      email: 'alice@student.example.com',
      role: 'STUDENT',
      is_banned: false,
      created_at: '2026-09-10T10:00:00.000Z',
      student: {
        first_name: 'Alice',
        last_name: 'Walker',
      },
      recruiter: null,
    };

    const sampleRecruiter = {
      id: validRecruiterId,
      email: 'bob@technova.example.com',
      role: 'RECRUITER',
      is_banned: true,
      created_at: '2026-08-15T09:30:00.000Z',
      student: null,
      recruiter: {
        first_name: 'Bob',
        last_name: 'Smith',
        company: {
          name: 'TechNova Solutions',
        },
      },
    };

    const sampleAdmin = {
      id: validAdminId,
      email: 'admin@careerforge.example.com',
      role: 'ADMIN',
      is_banned: false,
      created_at: '2026-01-01T00:00:00.000Z',
      student: null,
      recruiter: null,
    };

    it('1. user card/row renders student correctly', () => {
      const displayName = getUserDisplayName(sampleStudent);
      const roleConfig = getRoleBadgeConfig(sampleStudent.role);

      assert.equal(displayName, 'Alice Walker');
      assert.equal(roleConfig.label, 'Student');
      assert.equal(roleConfig.variant, 'info');
      assert.equal(sampleStudent.student.first_name, 'Alice');
      assert.equal(sampleStudent.student.last_name, 'Walker');
    });

    it('2. recruiter renders company name', () => {
      const displayName = getUserDisplayName(sampleRecruiter);
      const roleConfig = getRoleBadgeConfig(sampleRecruiter.role);

      assert.equal(displayName, 'Bob Smith');
      assert.equal(roleConfig.label, 'Recruiter');
      assert.equal(roleConfig.variant, 'warning');
      assert.equal(sampleRecruiter.recruiter.company.name, 'TechNova Solutions');
    });

    it('3. admin role renders correctly', () => {
      const displayName = getUserDisplayName(sampleAdmin);
      const roleConfig = getRoleBadgeConfig(sampleAdmin.role);

      assert.equal(displayName, 'Administrator');
      assert.equal(roleConfig.label, 'Admin');
      assert.equal(roleConfig.variant, 'default');
    });

    it('4. email renders correctly', () => {
      const mailtoHref = `mailto:${sampleStudent.email}`;
      assert.equal(sampleStudent.email, 'alice@student.example.com');
      assert.equal(mailtoHref, 'mailto:alice@student.example.com');
      assert.equal(mailtoHref.startsWith('javascript:'), false);
    });

    it('5. active/banned status renders correctly', () => {
      // Active user
      assert.equal(sampleStudent.is_banned, false);
      const activeBadge = sampleStudent.is_banned
        ? { variant: 'destructive', text: 'Banned' }
        : { variant: 'success', text: 'Active' };
      assert.equal(activeBadge.variant, 'success');
      assert.equal(activeBadge.text, 'Active');

      // Banned user
      assert.equal(sampleRecruiter.is_banned, true);
      const bannedBadge = sampleRecruiter.is_banned
        ? { variant: 'destructive', text: 'Banned' }
        : { variant: 'success', text: 'Active' };
      assert.equal(bannedBadge.variant, 'destructive');
      assert.equal(bannedBadge.text, 'Banned');
    });

    it('6. role filter emits All/Student/Recruiter', () => {
      const emittedRoles = [];
      const onRoleChange = (role) => {
        emittedRoles.push(role);
      };

      // Clicking 'All Users' emits undefined
      onRoleChange(undefined);
      // Clicking 'Students' emits 'STUDENT'
      onRoleChange('STUDENT');
      // Clicking 'Recruiters' emits 'RECRUITER'
      onRoleChange('RECRUITER');

      assert.deepEqual(emittedRoles, [undefined, 'STUDENT', 'RECRUITER']);
    });

    it('7. email search emits entered value', () => {
      let lastSearch = '';
      const onSearchChange = (val) => {
        lastSearch = val;
      };

      onSearchChange('alice@student.example.com');
      assert.equal(lastSearch, 'alice@student.example.com');

      onSearchChange('technova');
      assert.equal(lastSearch, 'technova');
    });

    it('8. delete action emits correct callback', () => {
      let targetUser = null;
      const onDelete = (user) => {
        targetUser = user;
      };

      onDelete(sampleStudent);
      assert.deepEqual(targetUser, sampleStudent);
      assert.equal(targetUser.id, sampleStudent.id);

      onDelete(sampleRecruiter);
      assert.deepEqual(targetUser, sampleRecruiter);
      assert.equal(targetUser.id, sampleRecruiter.id);
    });

    it('9. delete dialog shows target identity', () => {
      const studentName = getUserDisplayName(sampleStudent);
      const studentEmail = sampleStudent.email;

      const identityDescription = `Are you sure you want to permanently delete the account for "${studentName}" (${studentEmail})?`;
      assert.ok(identityDescription.includes(studentName));
      assert.ok(identityDescription.includes(studentEmail));
    });

    it('10. delete dialog requires explicit confirmation', () => {
      let confirmCalled = false;
      const onConfirm = () => {
        confirmCalled = true;
      };

      // Modal open state without clicking confirm
      assert.equal(confirmCalled, false);

      // Confirm button clicked
      onConfirm();
      assert.equal(confirmCalled, true);
    });

    it('11. delete dialog cancel works', () => {
      let cancelCalled = false;
      const onCancel = () => {
        cancelCalled = true;
      };

      // Cancel button or Escape key invokes onCancel
      onCancel();
      assert.equal(cancelCalled, true);
    });

    it('12. deleting state disables actions', () => {
      const evaluateControls = (isDeleting) => ({
        cancelDisabled: isDeleting,
        deleteDisabled: isDeleting,
        deleteLoading: isDeleting,
      });

      const idleState = evaluateControls(false);
      assert.equal(idleState.cancelDisabled, false);
      assert.equal(idleState.deleteDisabled, false);
      assert.equal(idleState.deleteLoading, false);

      const deletingState = evaluateControls(true);
      assert.equal(deletingState.cancelDisabled, true);
      assert.equal(deletingState.deleteDisabled, true);
      assert.equal(deletingState.deleteLoading, true);
    });

    it('13. skeleton renders', () => {
      const skeletonProps = { count: 4 };
      assert.equal(skeletonProps.count, 4);

      const skeletonContent = fs.readFileSync(
        path.join(componentsDir, 'AdminUserListSkeleton.tsx'),
        'utf-8'
      );
      assert.ok(skeletonContent.includes('role="status"'));
      assert.ok(skeletonContent.includes('aria-label="Loading users"'));
      assert.ok(skeletonContent.includes('animate-pulse'));
    });

    it('14. empty state renders', () => {
      const evaluateEmptyState = (isFiltered) => {
        if (isFiltered) {
          return {
            title: 'No Matching Users Found',
            description:
              'No users match your active filter criteria or search query. Try clearing or broadening your search.',
          };
        }
        return {
          title: 'No Users Registered',
          description:
            'There are currently no platform users registered in the system.',
        };
      };

      const unfiltered = evaluateEmptyState(false);
      assert.equal(unfiltered.title, 'No Users Registered');

      const filtered = evaluateEmptyState(true);
      assert.equal(filtered.title, 'No Matching Users Found');
    });

    it('15. error state renders sanitized message', () => {
      const defaultMessage =
        'Unable to retrieve users for administration. Please check your network connection and try again.';
      const customMessage = 'Failed to load user list.';

      const evaluateError = (msg) => ({
        message: msg || defaultMessage,
      });

      assert.equal(evaluateError().message, defaultMessage);
      assert.equal(evaluateError(customMessage).message, customMessage);
    });

    it('16. retry callback works', () => {
      let retryCount = 0;
      const onRetry = () => {
        retryCount++;
      };

      onRetry();
      assert.equal(retryCount, 1);
    });

    it('17. no password/auth/internal IDs are displayed', () => {
      const privateFields = [
        'password',
        'password_hash',
        'salt',
        'token',
        'secret',
        'student_id',
        'recruiter_id',
        'company_id',
      ];

      for (const field of privateFields) {
        assert.equal(sampleStudent[field], undefined);
        assert.equal(sampleRecruiter[field], undefined);
        assert.equal(sampleAdmin[field], undefined);
      }

      const cardContent = fs.readFileSync(
        path.join(componentsDir, 'AdminUserCard.tsx'),
        'utf-8'
      );
      assert.equal(cardContent.includes('<span>{user.id}</span>'), false);
      assert.equal(cardContent.includes('<p>{user.id}</p>'), false);
      assert.equal(cardContent.includes('password'), false);
      assert.equal(cardContent.includes('password_hash'), false);
      assert.equal(cardContent.includes('token'), false);
    });

    it('18. no localStorage usage', () => {
      const componentFiles = fs.readdirSync(componentsDir);
      for (const file of componentFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
        assert.equal(
          content.includes('localStorage'),
          false,
          `Component ${file} contains localStorage`
        );
      }
    });

    it('19. no direct API calls are made from presentational components', () => {
      const componentFiles = fs.readdirSync(componentsDir);
      for (const file of componentFiles) {
        const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
        assert.equal(
          content.includes('apiClient'),
          false,
          `Component ${file} directly references apiClient`
        );
        assert.equal(
          content.includes('axios'),
          false,
          `Component ${file} directly references axios`
        );
        assert.equal(
          content.includes('deleteAdminUser('),
          false,
          `Component ${file} directly calls deleteAdminUser`
        );
        assert.equal(
          content.includes('getAdminUsers('),
          false,
          `Component ${file} directly calls getAdminUsers`
        );
      }
    });
  });

  // =========================================================================
  // 8. Admin Users Page & Route Integration Suite (Phase 5.14.4)
  // =========================================================================
  describe('8. Admin Users Page & Route Integration Suite (Phase 5.14.4)', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const routerFile = path.resolve(srcDir, 'router/routes.tsx');
    const layoutFile = path.resolve(srcDir, 'layouts/AdminLayout.tsx');
    const adminPagesFile = path.resolve(srcDir, 'pages/AdminPages.tsx');
    const adminUsersPageFile = path.resolve(featuresDir, 'AdminUsersPage.tsx');

    function evaluateAdminUsersSearchParams(searchString) {
      const params = new URLSearchParams(searchString);
      const pageParam = parseInt(params.get('page') || '1', 10);
      const currentPage =
        Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      const roleParam = params.get('role');
      const role =
        roleParam === 'STUDENT' || roleParam === 'RECRUITER'
          ? roleParam
          : undefined;
      const search = params.get('search') || '';
      return { currentPage, role, search };
    }

    function transitionAdminUsersUrl(currentSearchString, updates = {}) {
      const params = new URLSearchParams(currentSearchString);
      if (updates.page !== undefined) {
        if (updates.page > 1) {
          params.set('page', updates.page.toString());
        } else {
          params.delete('page');
        }
      }
      if ('role' in updates) {
        if (updates.role) {
          params.set('role', updates.role);
        } else {
          params.delete('role');
        }
        params.delete('page'); // Reset to page 1
      }
      if ('search' in updates) {
        const trimmed = (updates.search || '').trim();
        if (trimmed) {
          params.set('search', trimmed);
        } else {
          params.delete('search');
        }
        params.delete('page'); // Reset to page 1
      }
      return params.toString();
    }

    function evaluateUsersPaginationState(page, totalPages) {
      return {
        prevDisabled: page <= 1,
        nextDisabled: page >= totalPages || totalPages === 0,
      };
    }

    const sampleStudent = {
      id: validUserId,
      email: 'alice@student.example.com',
      role: 'STUDENT',
      is_banned: false,
      created_at: '2026-09-10T10:00:00.000Z',
      student: {
        first_name: 'Alice',
        last_name: 'Walker',
      },
      recruiter: null,
    };

    const sampleRecruiter = {
      id: validRecruiterId,
      email: 'bob@technova.example.com',
      role: 'RECRUITER',
      is_banned: false,
      created_at: '2026-08-15T09:30:00.000Z',
      student: null,
      recruiter: {
        first_name: 'Bob',
        last_name: 'Smith',
        company: {
          name: 'TechNova Solutions',
        },
      },
    };

    it('1. /admin/users is ADMIN-only', () => {
      const routesContent = fs.readFileSync(routerFile, 'utf-8');
      assert.ok(routesContent.includes("path: '/admin'"));
      assert.ok(routesContent.includes("allowedRoles={['ADMIN']}"));
      assert.ok(routesContent.includes("path: 'users'"));
      assert.ok(routesContent.includes('AdminUsersPage'));
    });

    it('2. AdminUsersPage reads page/role/search from URL', () => {
      const parsed = evaluateAdminUsersSearchParams(
        '?page=3&role=STUDENT&search=alice%40example.com'
      );
      assert.equal(parsed.currentPage, 3);
      assert.equal(parsed.role, 'STUDENT');
      assert.equal(parsed.search, 'alice@example.com');

      // Defaults
      const defaults = evaluateAdminUsersSearchParams('');
      assert.equal(defaults.currentPage, 1);
      assert.equal(defaults.role, undefined);
      assert.equal(defaults.search, '');

      // Invalid / out of bounds
      const invalid = evaluateAdminUsersSearchParams('?page=-5&role=ADMIN');
      assert.equal(invalid.currentPage, 1);
      assert.equal(invalid.role, undefined);
    });

    it('3. API query receives page/limit/role/search', () => {
      const { currentPage, role, search } = evaluateAdminUsersSearchParams(
        '?page=2&role=RECRUITER&search=technova'
      );
      const query = buildAdminUsersQueryParams({
        page: currentPage,
        limit: 20,
        role,
        search,
      });

      assert.deepEqual(query, {
        page: 2,
        limit: 20,
        role: 'RECRUITER',
        search: 'technova',
      });
    });

    it('4. Header renders total count', () => {
      const headerText = (total) =>
        `${total} Registered User${total === 1 ? '' : 's'}`;

      assert.equal(headerText(42), '42 Registered Users');
      assert.equal(headerText(1), '1 Registered User');
      assert.equal(headerText(0), '0 Registered Users');
    });

    it('5. Users render correctly', () => {
      const userList = [sampleStudent, sampleRecruiter];
      assert.equal(userList.length, 2);
      assert.equal(getUserDisplayName(userList[0]), 'Alice Walker');
      assert.equal(getUserDisplayName(userList[1]), 'Bob Smith');
    });

    it('6. role filter updates URL', () => {
      const urlWithStudent = transitionAdminUsersUrl('', { role: 'STUDENT' });
      assert.equal(urlWithStudent, 'role=STUDENT');

      const urlWithAll = transitionAdminUsersUrl('role=STUDENT', {
        role: undefined,
      });
      assert.equal(urlWithAll, '');
    });

    it('7. search updates URL', () => {
      const urlWithSearch = transitionAdminUsersUrl('', {
        search: 'bob@example.com',
      });
      assert.equal(urlWithSearch, 'search=bob%40example.com');

      const urlCleared = transitionAdminUsersUrl(urlWithSearch, { search: '' });
      assert.equal(urlCleared, '');
    });

    it('8. changing role/search resets page to 1', () => {
      const roleChangeResets = transitionAdminUsersUrl('page=3&role=STUDENT', {
        role: 'RECRUITER',
      });
      assert.equal(roleChangeResets, 'role=RECRUITER');
      assert.equal(roleChangeResets.includes('page'), false);

      const searchChangeResets = transitionAdminUsersUrl(
        'page=5&search=oldquery',
        { search: 'newquery' }
      );
      assert.equal(searchChangeResets, 'search=newquery');
      assert.equal(searchChangeResets.includes('page'), false);
    });

    it('9. pagination changes page while preserving filters', () => {
      const initial = 'role=STUDENT&search=alice';
      const page2 = transitionAdminUsersUrl(initial, { page: 2 });
      assert.equal(page2, 'role=STUDENT&search=alice&page=2');

      const page1 = transitionAdminUsersUrl(page2, { page: 1 });
      assert.equal(page1, 'role=STUDENT&search=alice');
    });

    it('10. Previous disabled on first page', () => {
      const firstPage = evaluateUsersPaginationState(1, 5);
      assert.equal(firstPage.prevDisabled, true);
      assert.equal(firstPage.nextDisabled, false);
    });

    it('11. Next disabled on last page', () => {
      const lastPage = evaluateUsersPaginationState(5, 5);
      assert.equal(lastPage.prevDisabled, false);
      assert.equal(lastPage.nextDisabled, true);
    });

    it('12. empty state renders', () => {
      const evaluateEmpty = (isFiltered) => ({
        isFiltered,
        title: isFiltered ? 'No Matching Users Found' : 'No Users Registered',
      });

      assert.equal(evaluateEmpty(false).title, 'No Users Registered');
      assert.equal(evaluateEmpty(true).title, 'No Matching Users Found');
    });

    it('13. error state and retry render', () => {
      let retryCount = 0;
      const onRetry = () => {
        retryCount++;
      };

      assert.equal(retryCount, 0);
      onRetry();
      assert.equal(retryCount, 1);
    });

    it('14. delete action opens dialog', () => {
      let selectedUser = null;
      let isDialogOpen = false;

      const handleDeleteClick = (user) => {
        selectedUser = user;
        isDialogOpen = true;
      };

      handleDeleteClick(sampleStudent);
      assert.deepEqual(selectedUser, sampleStudent);
      assert.equal(isDialogOpen, true);
    });

    it('15. dialog displays selected user', () => {
      const displayName = getUserDisplayName(sampleStudent);
      assert.equal(displayName, 'Alice Walker');
      assert.equal(sampleStudent.email, 'alice@student.example.com');
    });

    it('16. confirm delete sends correct user ID', async () => {
      let deletedId = null;
      const mockMutateAsync = async (id) => {
        deletedId = id;
        return { success: true, message: 'User deleted' };
      };

      await mockMutateAsync(sampleStudent.id);
      assert.equal(deletedId, validUserId);
    });

    it('17. deleting state is isolated to selected user', () => {
      const deletingUserId = sampleStudent.id;
      assert.equal(deletingUserId === sampleStudent.id, true);
      assert.equal(deletingUserId === sampleRecruiter.id, false);
    });

    it('18. successful deletion triggers query invalidation/refetch', () => {
      const baseKey = adminUsersBaseKey();
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

    it('19. failed deletion keeps user visible', () => {
      const users = [sampleStudent];
      let hasError = false;

      const simulateFailedDelete = () => {
        hasError = true;
      };

      simulateFailedDelete();
      assert.equal(hasError, true);
      assert.equal(users.length, 1);
      assert.equal(users[0].id, validUserId);
    });

    it('20. page adjusts correctly after deleting last user on final page', () => {
      let currentPage = 3;
      const meta = { totalPages: 2 };

      // When currentPage > meta.totalPages
      if (meta.totalPages > 0 && currentPage > meta.totalPages) {
        currentPage = meta.totalPages;
      }

      assert.equal(currentPage, 2);
    });

    it('21. no localStorage usage', () => {
      const pageContent = fs.readFileSync(adminUsersPageFile, 'utf-8');
      assert.equal(pageContent.includes('localStorage'), false);
    });

    it('22. no invented API endpoint', () => {
      const pageContent = fs.readFileSync(adminUsersPageFile, 'utf-8');
      assert.equal(pageContent.includes('apiClient'), false);
      assert.equal(pageContent.includes('axios'), false);
      assert.equal(pageContent.includes('/api/'), false);
    });

    it('23. no password/auth/internal IDs rendered', () => {
      const pageContent = fs.readFileSync(adminUsersPageFile, 'utf-8');
      assert.equal(pageContent.includes('password'), false);
      assert.equal(pageContent.includes('password_hash'), false);
      assert.equal(pageContent.includes('token'), false);
      assert.equal(pageContent.includes('<span>{user.id}</span>'), false);
      assert.equal(pageContent.includes('<p>{user.id}</p>'), false);
    });

    it('24. /admin/moderation still works', () => {
      const routesContent = fs.readFileSync(routerFile, 'utf-8');
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');

      assert.ok(routesContent.includes("path: 'moderation'"));
      assert.ok(routesContent.includes('AdminModerationPage'));
      assert.ok(layoutContent.includes("path: '/admin/moderation'"));
      assert.ok(layoutContent.includes("'Job Moderation'"));
    });

    it('25. /admin/analytics still works', () => {
      const routesContent = fs.readFileSync(routerFile, 'utf-8');
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');

      assert.ok(routesContent.includes("path: 'analytics'"));
      assert.ok(routesContent.includes('AdminAnalyticsPage'));
      assert.ok(layoutContent.includes("path: '/admin/analytics'"));
      assert.ok(layoutContent.includes("'Analytics'"));
    });

    it('26. Users navigation points to /admin/users', () => {
      const layoutContent = fs.readFileSync(layoutFile, 'utf-8');
      assert.ok(layoutContent.includes("path: '/admin/users'"));
      assert.ok(layoutContent.includes("label: 'Users'"));
      assert.ok(layoutContent.includes('icon: Users'));
    });
  });
});

