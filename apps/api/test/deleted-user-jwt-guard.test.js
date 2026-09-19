const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { UserRole } = require('@prisma/client');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { TokenService } = require('../dist/modules/auth/token.service');

describe('Security Regression: Deleted User JWT Invalidation (FINDING-01)', () => {
  const testSecret = 'cf-test-jwt-secret-key-32-chars-long-for-jwt-guard-test';
  const mockConfig = {
    jwtSecret: testSecret,
    jwtExpiresIn: '1h',
    authCookieName: 'cf_auth',
  };

  let tokenService;
  let reflector;

  beforeEach(() => {
    const jwtService = new JwtService({ secret: testSecret });
    tokenService = new TokenService(jwtService, mockConfig);
    reflector = new Reflector();
  });

  function createMockExecutionContext(headers = {}, cookies = {}, isPublic = false) {
    reflector.getAllAndOverride = () => isPublic;
    const req = {
      headers,
      cookies,
      user: undefined,
    };
    return {
      context: {
        getHandler: () => () => {},
        getClass: () => class {},
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      },
      req,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Core Regression: User Lifecycle (Create -> Authenticate -> Delete -> Reuse)
  // ---------------------------------------------------------------------------
  it('strictly rejects token with HTTP 401 when user is deleted after token issuance', async () => {
    // In-memory database fixture simulating user repository
    const dbUsers = new Map();

    const testUser = {
      id: '11111111-2222-3333-4444-555555555555',
      email: 'student@university.edu',
      role: UserRole.STUDENT,
      is_banned: false,
    };

    // 1. Create test user in database
    dbUsers.set(testUser.id, { ...testUser });

    const mockPrisma = {
      user: {
        findUnique: async ({ where }) => {
          const u = dbUsers.get(where.id);
          return u ? { is_banned: u.is_banned } : null;
        },
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);

    // 2. Issue a valid cryptographically-signed token
    const token = await tokenService.signToken(testUser);

    // 3. Confirm the token works before deletion
    const { context: preContext, req: preReq } = createMockExecutionContext({
      authorization: `Bearer ${token}`,
    });

    const preResult = await guard.canActivate(preContext);
    assert.equal(preResult, true, 'Authentication must succeed while user exists in database');
    assert.equal(preReq.user.userId, testUser.id);
    assert.equal(preReq.user.email, testUser.email);
    assert.equal(preReq.user.role, UserRole.STUDENT);

    // 4. Delete the user from database
    dbUsers.delete(testUser.id);
    assert.equal(dbUsers.has(testUser.id), false, 'Precondition: User must be removed from database');

    // 5. Reuse the same token after deletion
    const { context: postContext } = createMockExecutionContext({
      authorization: `Bearer ${token}`,
    });

    // 6. Confirms the request is rejected with HTTP 401 UNAUTHORIZED
    await assert.rejects(
      () => guard.canActivate(postContext),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 401, 'Expected HTTP 401 Unauthorized');
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'UNAUTHORIZED');
        assert.equal(response.message, 'User account no longer exists');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Cookie Transport: Deleted User via HttpOnly Cookie
  // ---------------------------------------------------------------------------
  it('rejects deleted user token transported via HttpOnly cookie with HTTP 401', async () => {
    const deletedUserId = '99999999-8888-7777-6666-555555555555';
    const token = await tokenService.signToken({
      id: deletedUserId,
      email: 'deleted-recruiter@company.com',
      role: UserRole.RECRUITER,
    });

    const mockPrisma = {
      user: {
        findUnique: async () => null, // User no longer exists in database
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);
    const { context } = createMockExecutionContext(
      {},
      { cf_auth: token } // Transported via HttpOnly cookie
    );

    await assert.rejects(
      () => guard.canActivate(context),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 401);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'UNAUTHORIZED');
        assert.equal(response.message, 'User account no longer exists');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Admin Account Deletion Scenario
  // ---------------------------------------------------------------------------
  it('rejects deleted admin account from accessing protected admin routes', async () => {
    const adminUser = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      email: 'revoked-admin@careerforge.dev',
      role: UserRole.ADMIN,
    };

    const token = await tokenService.signToken(adminUser);

    const mockPrisma = {
      user: {
        findUnique: async () => null, // Admin user was deleted
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);
    const { context } = createMockExecutionContext({
      authorization: `Bearer ${token}`,
    });

    await assert.rejects(
      () => guard.canActivate(context),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 401);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'UNAUTHORIZED');
        assert.equal(response.message, 'User account no longer exists');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Banned User: Preserves HTTP 403 Forbidden
  // ---------------------------------------------------------------------------
  it('preserves HTTP 403 Forbidden for banned existing user', async () => {
    const bannedUserId = 'bbbbbbbb-1111-2222-3333-444444444444';
    const token = await tokenService.signToken({
      id: bannedUserId,
      email: 'banned-student@university.edu',
      role: UserRole.STUDENT,
    });

    const mockPrisma = {
      user: {
        findUnique: async () => ({ is_banned: true }), // User exists, but is banned
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);
    const { context } = createMockExecutionContext({
      authorization: `Bearer ${token}`,
    });

    await assert.rejects(
      () => guard.canActivate(context),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 403);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'FORBIDDEN');
        assert.equal(response.message, 'Your account has been suspended. Contact support.');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 5. Active Valid User: Succeeds and Populates Request Context
  // ---------------------------------------------------------------------------
  it('allows active non-banned user and populates request.user context', async () => {
    const activeUser = {
      id: '22222222-3333-4444-5555-666666666666',
      email: 'valid-student@university.edu',
      role: UserRole.STUDENT,
    };

    const token = await tokenService.signToken(activeUser);

    const mockPrisma = {
      user: {
        findUnique: async () => ({ is_banned: false }),
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);
    const { context, req } = createMockExecutionContext({
      authorization: `Bearer ${token}`,
    });

    const result = await guard.canActivate(context);
    assert.equal(result, true);
    assert.equal(req.user.userId, activeUser.id);
    assert.equal(req.user.email, activeUser.email);
    assert.equal(req.user.role, UserRole.STUDENT);
  });

  // ---------------------------------------------------------------------------
  // 6. Missing Token: Preserves HTTP 401 UNAUTHORIZED
  // ---------------------------------------------------------------------------
  it('preserves HTTP 401 UNAUTHORIZED when authorization token is missing', async () => {
    const mockPrisma = {
      user: {
        findUnique: async () => ({ is_banned: false }),
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);
    const { context } = createMockExecutionContext({}, {});

    await assert.rejects(
      () => guard.canActivate(context),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 401);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'UNAUTHORIZED');
        assert.equal(response.message, 'Missing authorization token');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Malformed / Invalid Token: Preserves HTTP 401 UNAUTHORIZED
  // ---------------------------------------------------------------------------
  it('preserves HTTP 401 UNAUTHORIZED when token signature is invalid or malformed', async () => {
    const mockPrisma = {
      user: {
        findUnique: async () => ({ is_banned: false }),
      },
    };

    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig, mockPrisma);
    const { context } = createMockExecutionContext({
      authorization: 'Bearer invalid.tampered.token',
    });

    await assert.rejects(
      () => guard.canActivate(context),
      (err) => {
        assert.equal(err.getStatus?.() ?? err.status, 401);
        const response = err.getResponse?.() ?? err.response;
        assert.equal(response.code, 'UNAUTHORIZED');
        assert.equal(response.message, 'Invalid or expired token');
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Public Route: Allows Access Regardless of User Existence
  // ---------------------------------------------------------------------------
  it('allows access to public endpoints without throwing', async () => {
    const guard = new JwtAuthGuard(tokenService, reflector, mockConfig);
    const { context, req } = createMockExecutionContext({}, {}, true); // isPublic = true

    const result = await guard.canActivate(context);
    assert.equal(result, true);
    assert.equal(req.user, undefined);
  });
});
