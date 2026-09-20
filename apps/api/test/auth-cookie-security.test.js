const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Reflector } = require('@nestjs/core');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const {
  setAuthCookie,
  clearAuthCookie,
  parseCookieHeader,
} = require('../dist/core/utils/cookie.util');
const { CsrfMiddleware } = require('../dist/core/middleware/csrf.middleware');
const { AuthController } = require('../dist/modules/auth/auth.controller');
const { validateEnvironment } = require('../dist/core/config/config.validator');

describe('SEC-01: JWT to HttpOnly Cookie Security Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Cookie Utility Functions
  // --------------------------------------------------------------------------
  describe('1. Cookie Utilities (cookie.util)', () => {
    function createMockResponse() {
      const cookies = [];
      return {
        cookies,
        cookie(name, value, options) {
          cookies.push({ name, value, options });
        },
      };
    }

    it('should set HttpOnly cookie with lax SameSite and matching TTL', () => {
      const res = createMockResponse();
      const mockConfig = {
        authCookieName: 'cf_auth',
        authCookieMaxAgeSec: 604800,
        isProduction: false,
      };

      setAuthCookie(res, 'sample.jwt.token', mockConfig);

      assert.equal(res.cookies.length, 1);
      const cookie = res.cookies[0];
      assert.equal(cookie.name, 'cf_auth');
      assert.equal(cookie.value, 'sample.jwt.token');
      assert.equal(cookie.options.httpOnly, true, 'Must be HttpOnly');
      assert.equal(cookie.options.sameSite, 'lax', 'Must be SameSite=lax');
      assert.equal(cookie.options.path, '/', 'Must be path=/');
      assert.equal(cookie.options.secure, false, 'Secure must be false in development');
      assert.equal(cookie.options.maxAge, 604800 * 1000, 'Max-age in ms');
    });

    it('should set secure: true when isProduction is true', () => {
      const res = createMockResponse();
      const mockConfig = {
        authCookieName: 'cf_auth',
        authCookieMaxAgeSec: 3600,
        isProduction: true,
      };

      setAuthCookie(res, 'prod.jwt.token', mockConfig);

      assert.equal(res.cookies.length, 1);
      assert.equal(res.cookies[0].options.secure, true, 'Secure must be true in production');
      assert.equal(res.cookies[0].options.httpOnly, true);
    });

    it('should automatically force secure: true when sameSite is none even in dev (RFC 6265bis)', () => {
      const res = createMockResponse();
      const mockConfig = {
        authCookieName: 'cf_auth',
        authCookieMaxAgeSec: 3600,
        authCookieSameSite: 'none',
        isProduction: false, // development mode
      };

      setAuthCookie(res, 'cross.site.jwt.token', mockConfig);

      assert.equal(res.cookies.length, 1);
      assert.equal(res.cookies[0].options.sameSite, 'none');
      assert.equal(res.cookies[0].options.secure, true, 'SameSite=None MUST have Secure=true');
    });

    it('should clear auth cookie on logout with Max-Age 0 and expired date', () => {
      const res = createMockResponse();
      const mockConfig = {
        authCookieName: 'cf_auth',
        isProduction: true,
      };

      clearAuthCookie(res, mockConfig);

      assert.equal(res.cookies.length, 1);
      const cookie = res.cookies[0];
      assert.equal(cookie.name, 'cf_auth');
      assert.equal(cookie.value, '');
      assert.equal(cookie.options.maxAge, 0);
      assert.equal(cookie.options.expires.getTime(), 0);
      assert.equal(cookie.options.httpOnly, true);
      assert.equal(cookie.options.path, '/');
      assert.equal(cookie.options.secure, true);
    });

    it('should parse raw cookie header strings correctly', () => {
      const parsed = parseCookieHeader('cf_auth=token123; other=val; spaced = something ');
      assert.equal(parsed.cf_auth, 'token123');
      assert.equal(parsed.other, 'val');
      assert.equal(parsed.spaced, 'something');
    });

    it('should handle undefined or empty cookie headers gracefully', () => {
      assert.deepEqual(parseCookieHeader(undefined), {});
      assert.deepEqual(parseCookieHeader(''), {});
    });
  });

  // --------------------------------------------------------------------------
  // 2. JwtAuthGuard Authentication Behavior
  // --------------------------------------------------------------------------
  describe('2. JwtAuthGuard Token Extraction & Protection', () => {
    const mockReflector = new Reflector();
    const mockConfig = {
      authCookieName: 'cf_auth',
    };

    const validPayload = {
      sub: 'user-uuid-1234',
      email: 'student@example.com',
      role: 'STUDENT',
    };

    const mockTokenService = {
      async verifyToken(token) {
        if (token === 'valid.cookie.token' || token === 'valid.bearer.token') {
          return validPayload;
        }
        if (token === 'expired.token') {
          const err = new Error('jwt expired');
          err.name = 'TokenExpiredError';
          throw err;
        }
        const err = new Error('invalid token');
        err.name = 'JsonWebTokenError';
        throw err;
      },
    };

    it('should authenticate browser requests via HttpOnly cookie (req.cookies)', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        headers: {},
        cookies: {
          cf_auth: 'valid.cookie.token',
        },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      const result = await guard.canActivate(context);
      assert.equal(result, true);
      assert.equal(request.user.userId, 'user-uuid-1234');
      assert.equal(request.user.email, 'student@example.com');
      assert.equal(request.user.role, 'STUDENT');
    });

    it('should authenticate browser requests via raw Cookie header fallback', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        headers: {
          cookie: 'cf_auth=valid.cookie.token; other=123',
        },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      const result = await guard.canActivate(context);
      assert.equal(result, true);
      assert.equal(request.user.userId, 'user-uuid-1234');
    });

    it('should retain Authorization: Bearer fallback for non-browser / test clients', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        headers: {
          authorization: 'Bearer valid.bearer.token',
        },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      const result = await guard.canActivate(context);
      assert.equal(result, true);
      assert.equal(request.user.userId, 'user-uuid-1234');
    });

    it('should prioritize cookie over Bearer header when both are present', async () => {
      let verifiedToken = null;
      const trackingTokenService = {
        async verifyToken(token) {
          verifiedToken = token;
          return validPayload;
        },
      };

      const guard = new JwtAuthGuard(trackingTokenService, mockReflector, mockConfig);
      const request = {
        headers: {
          authorization: 'Bearer valid.bearer.token',
        },
        cookies: {
          cf_auth: 'valid.cookie.token',
        },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await guard.canActivate(context);
      assert.equal(verifiedToken, 'valid.cookie.token', 'Cookie must take priority');
    });

    it('should reject request with 401 when both cookie and Bearer are missing', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        headers: {},
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(context),
        (err) => err.status === 401 && err.response.code === 'UNAUTHORIZED'
      );
    });

    it('should reject request with 401 when token is invalid', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        cookies: { cf_auth: 'invalid.token' },
        headers: {},
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(context),
        (err) => err.status === 401 || err.name === 'JsonWebTokenError'
      );
    });

    it('should reject request with 401 when token is expired', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        cookies: { cf_auth: 'expired.token' },
        headers: {},
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(context),
        (err) => err.status === 401 || err.name === 'TokenExpiredError'
      );
    });

    it('CRITICAL: must NOT extract tokens from query parameters (query-token injection rejected)', async () => {
      const guard = new JwtAuthGuard(mockTokenService, mockReflector, mockConfig);
      const request = {
        headers: {},
        query: { token: 'valid.cookie.token', access_token: 'valid.cookie.token' },
        url: '/api/v1/resumes/123/file?token=valid.cookie.token',
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => () => {},
        getClass: () => class {},
      };

      await assert.rejects(
        () => guard.canActivate(context),
        (err) => err.status === 401 && err.response.code === 'UNAUTHORIZED'
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. AuthController Endpoints (Login, Register, Logout, /me)
  // --------------------------------------------------------------------------
  describe('3. AuthController Cookie Setting & No JWT Exposure in Body', () => {
    const mockConfig = {
      authCookieName: 'cf_auth',
      authCookieMaxAgeSec: 604800,
      isProduction: false,
    };

    const mockAuthService = {
      async login(dto) {
        return {
          user_id: 'user-111',
          email: dto.email,
          role: 'STUDENT',
          token: 'secret.jwt.token',
        };
      },
      async register(dto) {
        return {
          user_id: 'user-222',
          email: dto.email,
          role: dto.role,
          token: 'secret.jwt.token',
        };
      },
    };

    it('login: sets HttpOnly cookie and does NOT expose JWT in response body', async () => {
      const controller = new AuthController(mockAuthService, mockConfig);
      const cookies = [];
      const res = {
        cookie: (name, val, opts) => cookies.push({ name, val, opts }),
      };

      const result = await controller.login({ email: 'test@example.com', password: 'Pass' }, res);

      // Verify response body has NO token field
      assert.equal(result.success, true);
      assert.equal(result.data.user_id, 'user-111');
      assert.equal(result.data.email, 'test@example.com');
      assert.equal(result.data.role, 'STUDENT');
      assert.equal(result.data.token, undefined, 'JWT must NOT be in JSON response body');

      // Verify cookie was set
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'cf_auth');
      assert.equal(cookies[0].val, 'secret.jwt.token');
      assert.equal(cookies[0].opts.httpOnly, true);
    });

    it('register: sets HttpOnly cookie and does NOT expose JWT in response body', async () => {
      const controller = new AuthController(mockAuthService, mockConfig);
      const cookies = [];
      const res = {
        cookie: (name, val, opts) => cookies.push({ name, val, opts }),
      };

      const result = await controller.register(
        { email: 'reg@example.com', password: 'Pass', role: 'RECRUITER' },
        res
      );

      // Verify response body has NO token field
      assert.equal(result.success, true);
      assert.equal(result.data.user_id, 'user-222');
      assert.equal(result.data.email, 'reg@example.com');
      assert.equal(result.data.role, 'RECRUITER');
      assert.equal(result.data.token, undefined, 'JWT must NOT be in JSON response body');

      // Verify cookie was set
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'cf_auth');
      assert.equal(cookies[0].opts.httpOnly, true);
    });

    it('logout: clears auth cookie with maxAge: 0', async () => {
      const controller = new AuthController(mockAuthService, mockConfig);
      const cookies = [];
      const res = {
        cookie: (name, val, opts) => cookies.push({ name, val, opts }),
      };

      const result = await controller.logout(res);

      assert.equal(result.success, true);
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'cf_auth');
      assert.equal(cookies[0].val, '');
      assert.equal(cookies[0].opts.maxAge, 0);
    });

    it('me: returns current user claims from authenticated session', () => {
      const controller = new AuthController(mockAuthService, mockConfig);
      const authenticatedUser = {
        userId: 'user-333',
        email: 'student@example.com',
        role: 'STUDENT',
      };

      const result = controller.me(authenticatedUser);

      assert.equal(result.success, true);
      assert.equal(result.data.user_id, 'user-333');
      assert.equal(result.data.email, 'student@example.com');
      assert.equal(result.data.role, 'STUDENT');
      assert.equal(result.data.token, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // 4. CSRF Protection Middleware
  // --------------------------------------------------------------------------
  describe('4. CSRF Defense Middleware (csrf.middleware)', () => {
    const mockConfig = {
      corsOrigin: 'http://localhost:5173, https://app.careerforge.com',
    };
    const csrf = new CsrfMiddleware(mockConfig);

    it('should permit state-changing POST requests from allowed origins', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: { origin: 'http://localhost:5173' },
      };
      const res = {};
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, res, next);
      assert.equal(nextCalled, true);
    });

    it('should reject state-changing POST requests from disallowed origins with 403', () => {
      let nextCalled = false;
      let statusSent = null;
      let jsonSent = null;
      const req = {
        method: 'POST',
        headers: { origin: 'https://evil-hacker.com' },
      };
      const res = {
        status(code) {
          statusSent = code;
          return {
            json(data) {
              jsonSent = data;
            },
          };
        },
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, res, next);
      assert.equal(nextCalled, false, 'Next must not be called');
      assert.equal(statusSent, 403);
      assert.equal(jsonSent.success, false);
      assert.equal(jsonSent.error.code, 'FORBIDDEN');
    });

    it('should reject DELETE requests from unauthorized origins', () => {
      let statusSent = null;
      const req = {
        method: 'DELETE',
        headers: { origin: 'https://malicious.org' },
      };
      const res = {
        status(code) {
          statusSent = code;
          return { json: () => {} };
        },
      };

      csrf.use(req, res, () => {});
      assert.equal(statusSent, 403);
    });

    it('should allow GET and HEAD safe methods regardless of origin', () => {
      let nextCalled = false;
      const req = {
        method: 'GET',
        headers: { origin: 'https://external-site.com' },
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, {}, next);
      assert.equal(nextCalled, true, 'GET requests must not be blocked by CSRF origin checks');
    });

    it('should allow server-to-server or test requests without Origin or Referer header', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {}, // no origin, no referer
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, {}, next);
      assert.equal(nextCalled, true, 'Requests without Origin or Referer (non-browser) should pass');
    });

    it('should reject state-changing POST if Origin is absent but Referer is from disallowed origin', () => {
      let statusSent = null;
      let jsonSent = null;
      const req = {
        method: 'POST',
        headers: {
          referer: 'https://evil-attacker.com/attack-page.html',
        },
      };
      const res = {
        status(code) {
          statusSent = code;
          return {
            json(data) {
              jsonSent = data;
            },
          };
        },
      };

      csrf.use(req, res, () => {});
      assert.equal(statusSent, 403, 'Must reject malicious Referer');
      assert.equal(jsonSent.error.code, 'FORBIDDEN');
    });

    it('should allow state-changing POST if Origin is absent but Referer is from allowed origin', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          referer: 'http://localhost:5173/student/dashboard',
        },
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, {}, next);
      assert.equal(nextCalled, true, 'Must allow valid Referer');
    });

    it('should reject state-changing POST when auth cookie is present but Origin and Referer are missing (Finding-08)', () => {
      let nextCalled = false;
      let statusSent = null;
      let jsonSent = null;
      const req = {
        method: 'POST',
        headers: {}, // missing origin and referer
        cookies: { cf_auth: 'valid-session-jwt-token' },
      };
      const res = {
        status(code) {
          statusSent = code;
          return {
            json(data) {
              jsonSent = data;
            },
          };
        },
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, res, next);
      assert.equal(nextCalled, false, 'Next must not be called when auth cookie lacks Origin/Referer');
      assert.equal(statusSent, 403, 'Must reject with 403');
      assert.equal(jsonSent.success, false);
      assert.equal(jsonSent.error.code, 'FORBIDDEN');
    });

    it('should reject state-changing POST when raw cookie header has cf_auth but Origin and Referer are missing (Finding-08)', () => {
      let nextCalled = false;
      let statusSent = null;
      const req = {
        method: 'POST',
        headers: { cookie: 'other=123; cf_auth=valid-session-jwt; other2=456' },
      };
      const res = {
        status(code) {
          statusSent = code;
          return {
            json() {},
          };
        },
      };

      csrf.use(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false, 'Next must not be called');
      assert.equal(statusSent, 403, 'Must reject raw auth cookie without Origin');
    });

    it('should allow state-changing POST with Bearer auth without Origin or Referer (server-to-server / CLI client)', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: { authorization: 'Bearer api-key-or-jwt-token' },
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, {}, next);
      assert.equal(nextCalled, true, 'Bearer auth without Origin should be permitted');
    });

    it('should allow state-changing POST when auth cookie is present and valid configured Origin is provided', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: { origin: 'http://localhost:5173' },
        cookies: { cf_auth: 'valid-token' },
      };
      const next = () => {
        nextCalled = true;
      };

      csrf.use(req, {}, next);
      assert.equal(nextCalled, true, 'Cookie request with valid Origin must be allowed');
    });

    it('should reject state-changing POST when auth cookie is present and invalid Origin is provided', () => {
      let nextCalled = false;
      let statusSent = null;
      const req = {
        method: 'POST',
        headers: { origin: 'https://evil.com' },
        cookies: { cf_auth: 'valid-token' },
      };
      const res = {
        status(code) {
          statusSent = code;
          return { json() {} };
        },
      };

      csrf.use(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(statusSent, 403);
    });

    it('should allow safe methods (GET, HEAD, OPTIONS) with auth cookie even when Origin and Referer are missing', () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        let nextCalled = false;
        const req = {
          method,
          headers: {},
          cookies: { cf_auth: 'valid-token' },
        };
        csrf.use(req, {}, () => {
          nextCalled = true;
        });
        assert.equal(nextCalled, true, `${method} must be allowed without Origin`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Config Validation
  // --------------------------------------------------------------------------
  describe('5. Cookie Config Validation', () => {
    const baseEnv = {
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/careerforge?schema=public',
      JWT_SECRET: 'super-secret-key-at-least-32-characters-long',
      CORS_ORIGIN: 'http://localhost:5173',
    };

    it('should parse AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_SEC, and AUTH_COOKIE_SAMESITE with defaults', () => {
      const config = validateEnvironment({ ...baseEnv });
      assert.equal(config.authCookieName, 'cf_auth');
      assert.equal(config.authCookieMaxAgeSec, 7 * 24 * 3600);
      assert.equal(config.authCookieSameSite, 'lax');
    });

    it('should accept custom cookie configuration overrides including AUTH_COOKIE_SAMESITE=none', () => {
      const config = validateEnvironment({
        ...baseEnv,
        AUTH_COOKIE_NAME: 'custom_cookie',
        AUTH_COOKIE_MAX_AGE_SEC: '86400',
        AUTH_COOKIE_SAMESITE: 'none',
      });
      assert.equal(config.authCookieName, 'custom_cookie');
      assert.equal(config.authCookieMaxAgeSec, 86400);
      assert.equal(config.authCookieSameSite, 'none');
    });

    it('should reject invalid AUTH_COOKIE_SAMESITE value', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...baseEnv,
            AUTH_COOKIE_SAMESITE: 'invalid_mode',
          }),
        (err) => err.message.includes("AUTH_COOKIE_SAMESITE must be 'lax', 'strict', or 'none'")
      );
    });
  });
});
