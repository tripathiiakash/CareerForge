const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { HttpStatus, HttpException } = require('@nestjs/common');
const { RateLimitStore } = require('../dist/core/rate-limit/rate-limit.store');
const { RateLimitGuard } = require('../dist/core/rate-limit/rate-limit.guard');
const {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
} = require('../dist/core/rate-limit/rate-limit.decorator');
const {
  SecurityHeadersMiddleware,
} = require('../dist/core/middleware/security-headers.middleware');
const {
  AllExceptionsFilter,
} = require('../dist/core/filters/all-exceptions.filter');
const {
  validateEnvironment,
  ConfigValidationError,
} = require('../dist/core/config/config.validator');

describe('Security & Rate-Limit Hardening Suite (Phase 5.17.3)', () => {
  describe('1. RateLimitStore', () => {
    let store;

    beforeEach(() => {
      store = new RateLimitStore();
    });

    it('should track hits and calculate remaining quota correctly', () => {
      const res1 = store.increment('test:client-1', 5, 60);
      assert.equal(res1.totalHits, 1);
      assert.equal(res1.remaining, 4);
      assert.equal(res1.isBlocked, false);

      const res2 = store.increment('test:client-1', 5, 60);
      assert.equal(res2.totalHits, 2);
      assert.equal(res2.remaining, 3);
      assert.equal(res2.isBlocked, false);
    });

    it('should block requests when exceeding the specified limit', () => {
      for (let i = 1; i <= 3; i++) {
        const res = store.increment('test:client-2', 3, 60);
        assert.equal(res.totalHits, i);
        assert.equal(res.isBlocked, false);
      }

      // 4th request exceeds limit of 3
      const blockedRes = store.increment('test:client-2', 3, 60);
      assert.equal(blockedRes.totalHits, 4);
      assert.equal(blockedRes.remaining, 0);
      assert.equal(blockedRes.isBlocked, true);
      assert.ok(blockedRes.retryAfterSeconds > 0);
    });

    it('should maintain independent counters for different keys', () => {
      store.increment('auth:ip-1', 2, 60);
      store.increment('auth:ip-1', 2, 60);
      const blocked1 = store.increment('auth:ip-1', 2, 60);
      assert.equal(blocked1.isBlocked, true);

      // Different IP should still be allowed
      const allowed2 = store.increment('auth:ip-2', 2, 60);
      assert.equal(allowed2.isBlocked, false);
      assert.equal(allowed2.totalHits, 1);
    });

    it('should clear and reset counters on command', () => {
      store.increment('key-1', 5, 60);
      store.increment('key-2', 5, 60);
      assert.equal(store.size(), 2);

      store.reset('key-1');
      assert.equal(store.size(), 1);

      store.clear();
      assert.equal(store.size(), 0);
    });
  });

  describe('2. RateLimitGuard Evaluation', () => {
    let store;
    let mockConfig;

    beforeEach(() => {
      store = new RateLimitStore();
      mockConfig = {
        rateLimitEnabled: true,
        rateLimitGlobalMax: 120,
        rateLimitWindowSeconds: 60,
      };
    });

    function createMockContext({
      user,
      ip = '127.0.0.1',
      forwardedFor,
      handlerOptions,
      classOptions,
      skip = false,
    }) {
      const headers = {};
      const responseHeaders = {};

      if (forwardedFor) {
        headers['x-forwarded-for'] = forwardedFor;
      }

      const req = {
        ip,
        headers,
        socket: { remoteAddress: ip },
        user,
      };

      const res = {
        setHeader(name, value) {
          responseHeaders[name] = value;
        },
        getHeader(name) {
          return responseHeaders[name];
        },
      };

      const reflector = {
        getAllAndOverride(key) {
          if (key === SKIP_RATE_LIMIT_KEY) return skip;
          if (key === RATE_LIMIT_KEY) return handlerOptions || classOptions;
          return undefined;
        },
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => req,
          getResponse: () => res,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      return { context, req, res, reflector, responseHeaders };
    }

    it('should allow requests within limit and attach X-RateLimit headers', async () => {
      const { context, responseHeaders, reflector } = createMockContext({
        ip: '192.168.1.5',
        handlerOptions: {
          limit: 10,
          ttlSeconds: 60,
          keyPrefix: 'auth',
        },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);
      const allowed = await guard.canActivate(context);

      assert.equal(allowed, true);
      assert.equal(responseHeaders['X-RateLimit-Limit'], 10);
      assert.equal(responseHeaders['X-RateLimit-Remaining'], 9);
      assert.ok(responseHeaders['X-RateLimit-Reset'] > 0);
    });

    it('should throw 429 HttpException with RATE_LIMITED code when limit exceeded', async () => {
      const { context, responseHeaders, reflector } = createMockContext({
        ip: '192.168.1.10',
        handlerOptions: {
          limit: 2,
          ttlSeconds: 60,
          keyPrefix: 'auth',
          message: 'Too many authentication attempts. Please try again later.',
        },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);

      // Hit 1
      await guard.canActivate(context);
      assert.equal(responseHeaders['X-RateLimit-Remaining'], 1);

      // Hit 2
      await guard.canActivate(context);
      assert.equal(responseHeaders['X-RateLimit-Remaining'], 0);

      // Hit 3 — Exceeds limit
      await assert.rejects(
        () => guard.canActivate(context),
        (err) => {
          assert.ok(err instanceof HttpException);
          assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
          const response = err.getResponse();
          assert.equal(response.code, 'RATE_LIMITED');
          assert.equal(
            response.message,
            'Too many authentication attempts. Please try again later.'
          );
          return true;
        }
      );

      // Retry-After must be set
      assert.ok(responseHeaders['Retry-After'] >= 1);
    });

    it('should use user ID rather than IP when user is authenticated', async () => {
      const { context: ctx1, reflector: ref1 } = createMockContext({
        user: { userId: 'student-123' },
        ip: 'shared-nat-ip',
        handlerOptions: { limit: 1, keyPrefix: 'ai' },
      });

      const { context: ctx2, reflector: ref2 } = createMockContext({
        user: { userId: 'student-456' },
        ip: 'shared-nat-ip', // Same shared IP
        handlerOptions: { limit: 1, keyPrefix: 'ai' },
      });

      const guard = new RateLimitGuard(store, ref1, mockConfig);

      // User 1 uses their quota
      await guard.canActivate(ctx1);

      // User 1 is now blocked
      await assert.rejects(() => guard.canActivate(ctx1));

      // User 2 on the same NAT IP should NOT be blocked
      const guard2 = new RateLimitGuard(store, ref2, mockConfig);
      const allowedUser2 = await guard2.canActivate(ctx2);
      assert.equal(allowedUser2, true);
    });

    it('should respect @SkipRateLimit() decorator', async () => {
      const { context, reflector } = createMockContext({
        ip: '10.0.0.1',
        skip: true,
        handlerOptions: { limit: 1 },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);

      // Should not throw even after repeated invocations
      assert.equal(await guard.canActivate(context), true);
      assert.equal(await guard.canActivate(context), true);
      assert.equal(await guard.canActivate(context), true);
    });

    it('should safely extract first IP from comma-separated X-Forwarded-For', async () => {
      const { context, reflector } = createMockContext({
        forwardedFor: '203.0.113.195, 70.41.3.18, 150.172.238.178',
        handlerOptions: { limit: 1, keyPrefix: 'public' },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);
      await guard.canActivate(context);

      // Verify the key was stored with the true client IP
      assert.ok(store.records.has('public:ip:203.0.113.195'));
    });

    it('should enforce dedicated application rate limit (20 req / 60s per user)', async () => {
      const { context, responseHeaders, reflector } = createMockContext({
        user: { userId: 'student-applicant-1' },
        handlerOptions: {
          limit: 20,
          ttlSeconds: 60,
          keyPrefix: 'applications',
        },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);
      for (let i = 1; i <= 20; i++) {
        const allowed = await guard.canActivate(context);
        assert.equal(allowed, true);
        assert.equal(responseHeaders['X-RateLimit-Limit'], 20);
        assert.equal(responseHeaders['X-RateLimit-Remaining'], 20 - i);
      }

      await assert.rejects(
        () => guard.canActivate(context),
        (err) => {
          assert.ok(err instanceof HttpException);
          assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
          assert.equal(err.getResponse().code, 'RATE_LIMITED');
          return true;
        }
      );
    });
  });

  describe('3. SecurityHeadersMiddleware', () => {
    function createMockMiddlewareContext(isProduction = false) {
      const req = {};
      const headers = {};
      const res = {
        setHeader(name, value) {
          headers[name] = value;
        },
        getHeader(name) {
          return headers[name];
        },
      };
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };
      const configService = { isProduction };

      return { req, res, headers, next, wasNextCalled: () => nextCalled, configService };
    }

    it('should set all standard defense-in-depth security headers', () => {
      const { req, res, headers, next, wasNextCalled, configService } =
        createMockMiddlewareContext(false);

      const middleware = new SecurityHeadersMiddleware(configService);
      middleware.use(req, res, next);

      assert.equal(wasNextCalled(), true);
      assert.equal(headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(headers['X-Frame-Options'], 'DENY');
      assert.equal(headers['X-XSS-Protection'], '0');
      assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
      assert.equal(
        headers['Permissions-Policy'],
        'camera=(), microphone=(), geolocation=(), payment=()'
      );
      assert.equal(
        headers['Content-Security-Policy'],
        "default-src 'none'; frame-ancestors 'none'"
      );
      // HSTS should NOT be set in development
      assert.equal(headers['Strict-Transport-Security'], undefined);
    });

    it('should set Strict-Transport-Security (HSTS) in production', () => {
      const { req, res, headers, next, configService } =
        createMockMiddlewareContext(true);

      const middleware = new SecurityHeadersMiddleware(configService);
      middleware.use(req, res, next);

      assert.equal(
        headers['Strict-Transport-Security'],
        'max-age=31536000; includeSubDomains'
      );
    });
  });

  describe('4. AllExceptionsFilter (Rate-Limit & Payload Protection)', () => {
    function createMockFilterContext(url = '/api/v1/jobs') {
      let statusCode = 200;
      let jsonPayload = null;

      const host = {
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            url,
          }),
          getResponse: () => ({
            status(code) {
              statusCode = code;
              return this;
            },
            json(payload) {
              jsonPayload = payload;
              return this;
            },
          }),
        }),
      };

      return {
        host,
        getStatusCode: () => statusCode,
        getJsonPayload: () => jsonPayload,
      };
    }

    it('should map 429 TooManyRequests to RATE_LIMITED code adhering to docs/API.md', () => {
      const filter = new AllExceptionsFilter({ isProduction: true });
      const { host, getStatusCode, getJsonPayload } = createMockFilterContext();

      const exception = new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS
      );

      filter.catch(exception, host);

      assert.equal(getStatusCode(), 429);
      assert.deepEqual(getJsonPayload(), {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
    });

    it('should map Multer 413 LIMIT_FILE_SIZE to "File exceeds 5MB size limit"', () => {
      const filter = new AllExceptionsFilter({ isProduction: true });
      const { host, getStatusCode, getJsonPayload } = createMockFilterContext(
        '/api/v1/resumes/upload'
      );

      const multerErr = new Error('File too large');
      multerErr.code = 'LIMIT_FILE_SIZE';
      multerErr.name = 'MulterError';

      filter.catch(multerErr, host);

      assert.equal(getStatusCode(), 413);
      assert.deepEqual(getJsonPayload(), {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'File exceeds 5MB size limit',
        },
      });
    });

    it('should map body-parser entity.too.large 413 to "Request payload exceeds size limit"', () => {
      const filter = new AllExceptionsFilter({ isProduction: true });
      const { host, getStatusCode, getJsonPayload } = createMockFilterContext(
        '/api/v1/auth/register'
      );

      const bodyErr = new Error('request entity too large');
      bodyErr.status = 413;
      bodyErr.type = 'entity.too.large';

      filter.catch(bodyErr, host);

      assert.equal(getStatusCode(), 413);
      assert.deepEqual(getJsonPayload(), {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request payload exceeds size limit',
        },
      });
    });

    it('should mask internal errors and omit stack traces in production', () => {
      const filter = new AllExceptionsFilter({ isProduction: true });
      const { host, getStatusCode, getJsonPayload } = createMockFilterContext();

      const internalErr = new Error('Fatal database connection pool exhausted at /var/app/db.ts:42');

      filter.catch(internalErr, host);

      assert.equal(getStatusCode(), 500);
      assert.deepEqual(getJsonPayload(), {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal server error occurred.',
        },
      });
    });
  });

  describe('5. CORS Hardening & Environment Validation', () => {
    const validBaseEnv = {
      NODE_ENV: 'production',
      PORT: '5000',
      CORS_ORIGIN: 'https://careerforge.dev',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/careerforge?schema=public',
      JWT_SECRET: 'super-secure-production-secret-min-32-chars-long!',
    };

    it('should reject wildcard CORS_ORIGIN in production', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...validBaseEnv,
            CORS_ORIGIN: '*',
          }),
        (err) => {
          assert.ok(err instanceof ConfigValidationError);
          assert.ok(
            err.errors.some((e) =>
              e.includes('CORS_ORIGIN must not be wildcard (*) in production')
            )
          );
          return true;
        }
      );
    });

    it('should reject comma-separated CORS_ORIGIN containing wildcard in production', () => {
      assert.throws(
        () =>
          validateEnvironment({
            ...validBaseEnv,
            CORS_ORIGIN: 'https://careerforge.dev, *',
          }),
        (err) => {
          assert.ok(err instanceof ConfigValidationError);
          assert.ok(
            err.errors.some((e) =>
              e.includes('CORS_ORIGIN must not be wildcard (*) in production')
            )
          );
          return true;
        }
      );
    });

    it('should accept comma-separated specific origins in production', () => {
      const config = validateEnvironment({
        ...validBaseEnv,
        CORS_ORIGIN: 'https://careerforge.dev, https://app.careerforge.dev',
      });

      assert.equal(
        config.corsOrigin,
        'https://careerforge.dev, https://app.careerforge.dev'
      );
    });

    it('should parse optional rate limit configurations with sensible defaults', () => {
      const config = validateEnvironment({
        ...validBaseEnv,
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_AUTH_MAX: '15',
        RATE_LIMIT_AI_MAX: '8',
        RATE_LIMIT_PUBLIC_MAX: '50',
        RATE_LIMIT_GLOBAL_MAX: '200',
        RATE_LIMIT_WINDOW_SECONDS: '30',
      });

      assert.equal(config.rateLimitEnabled, true);
      assert.equal(config.rateLimitAuthMax, 15);
      assert.equal(config.rateLimitAiMax, 8);
      assert.equal(config.rateLimitPublicMax, 50);
      assert.equal(config.rateLimitGlobalMax, 200);
      assert.equal(config.rateLimitWindowSeconds, 30);
    });
  });
});
