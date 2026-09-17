const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { HttpStatus, HttpException, UnprocessableEntityException } = require('@nestjs/common');
const { PrismaClient } = require('@prisma/client');
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

const prisma = new PrismaClient();

describe('Security & Rate-Limit Hardening Suite (Phase 5.17.3)', () => {
  after(async () => {
    try {
      await prisma.$executeRaw`TRUNCATE TABLE "rate_limits"`;
    } catch (_) {}
    await prisma.$disconnect();
  });

  describe('1. RateLimitStore', () => {
    let store;

    beforeEach(async () => {
      store = new RateLimitStore(prisma);
      await store.clear();
    });

    it('should track hits and calculate remaining quota correctly', async () => {
      const res1 = await store.increment('test:client-1', 5, 60);
      assert.equal(res1.totalHits, 1);
      assert.equal(res1.remaining, 4);
      assert.equal(res1.isBlocked, false);
      assert.ok(res1.resetAt > 0);
      assert.ok(res1.retryAfterSeconds > 0);

      const res2 = await store.increment('test:client-1', 5, 60);
      assert.equal(res2.totalHits, 2);
      assert.equal(res2.remaining, 3);
      assert.equal(res2.isBlocked, false);
    });

    it('should block requests when exceeding the specified limit', async () => {
      for (let i = 1; i <= 3; i++) {
        const res = await store.increment('test:client-2', 3, 60);
        assert.equal(res.totalHits, i);
        assert.equal(res.isBlocked, false);
      }

      // 4th request exceeds limit of 3
      const blockedRes = await store.increment('test:client-2', 3, 60);
      assert.equal(blockedRes.totalHits, 4);
      assert.equal(blockedRes.remaining, 0);
      assert.equal(blockedRes.isBlocked, true);
      assert.ok(blockedRes.retryAfterSeconds > 0);
    });

    it('should maintain independent counters for different keys', async () => {
      await store.increment('auth:ip-1', 2, 60);
      await store.increment('auth:ip-1', 2, 60);
      const blocked1 = await store.increment('auth:ip-1', 2, 60);
      assert.equal(blocked1.isBlocked, true);

      // Different IP should still be allowed
      const allowed2 = await store.increment('auth:ip-2', 2, 60);
      assert.equal(allowed2.isBlocked, false);
      assert.equal(allowed2.totalHits, 1);
    });

    it('should clear and reset counters on command', async () => {
      await store.increment('key-1', 5, 60);
      await store.increment('key-2', 5, 60);
      assert.equal(await store.size(), 2);

      await store.reset('key-1');
      assert.equal(await store.size(), 1);

      await store.clear();
      assert.equal(await store.size(), 0);
    });

    it('should persist rate-limit state across multiple RateLimitStore instances (multi-instance)', async () => {
      const storeA = new RateLimitStore(prisma);
      const storeB = new RateLimitStore(prisma);

      // Instance A receives first hit
      const hit1 = await storeA.increment('cluster:shared-key', 5, 60);
      assert.equal(hit1.totalHits, 1);
      assert.equal(hit1.remaining, 4);

      // Instance B receives second hit for same key
      const hit2 = await storeB.increment('cluster:shared-key', 5, 60);
      assert.equal(hit2.totalHits, 2);
      assert.equal(hit2.remaining, 3);

      // Verify row in database matches shared state
      const record = await prisma.rateLimit.findUnique({
        where: { key: 'cluster:shared-key' },
      });
      assert.equal(record.hits, 2);
    });

    it('should atomically handle high concurrency without lost updates (race condition test)', async () => {
      const CONCURRENT_REQUESTS = 10;
      const results = await Promise.all(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          store.increment('concurrency:atomic-key', 15, 60)
        )
      );

      // Verify all hit counters are distinct from 1 to 10
      const hitNumbers = results.map((r) => r.totalHits).sort((a, b) => a - b);
      assert.deepEqual(
        hitNumbers,
        Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => i + 1)
      );

      // Verify record in PostgreSQL has exactly 10 hits
      const record = await prisma.rateLimit.findUnique({
        where: { key: 'concurrency:atomic-key' },
      });
      assert.equal(record.hits, 10);
    });

    it('should reset hits to 1 and start a new window when reset_at has expired', async () => {
      // Record hit 1
      await store.increment('expiry:test-key', 5, 60);

      // Manually expire the bucket in PostgreSQL
      const pastDate = new Date(Date.now() - 5000);
      await prisma.rateLimit.update({
        where: { key: 'expiry:test-key' },
        data: { reset_at: pastDate },
      });

      // Next increment should detect reset_at <= now, reset counter to 1 and advance window
      const resetRes = await store.increment('expiry:test-key', 5, 60);
      assert.equal(resetRes.totalHits, 1);
      assert.equal(resetRes.remaining, 4);
      assert.equal(resetRes.isBlocked, false);
      assert.ok(resetRes.resetAt > Math.floor(Date.now() / 1000));
    });

    it('should prune expired records and keep unexpired records with cleanupExpired()', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 60000);
      const future = new Date(now.getTime() + 60000);

      await prisma.rateLimit.createMany({
        data: [
          { key: 'cleanup:expired-1', hits: 5, reset_at: past },
          { key: 'cleanup:expired-2', hits: 3, reset_at: past },
          { key: 'cleanup:active-1', hits: 1, reset_at: future },
        ],
      });

      const deletedCount = await store.cleanupExpired();
      assert.equal(deletedCount, 2);

      const remainingKeys = await prisma.rateLimit.findMany({
        select: { key: true },
      });
      assert.equal(remainingKeys.length, 1);
      assert.equal(remainingKeys[0].key, 'cleanup:active-1');
    });

    it('should fail closed and rethrow database errors when Prisma operation fails', async () => {
      const brokenPrisma = {
        $queryRaw: async () => {
          throw new Error('Connection terminated unexpectedly');
        },
      };
      const failingStore = new RateLimitStore(brokenPrisma);

      await assert.rejects(
        () => failingStore.increment('broken:db-key', 5, 60),
        /Connection terminated unexpectedly/
      );
    });

    it('should throw if instantiated without PrismaService when increment is called', async () => {
      const storeWithoutPrisma = new RateLimitStore();
      await assert.rejects(
        () => storeWithoutPrisma.increment('test:no-db', 5, 60),
        /PrismaService is required for persistent rate limiting/
      );
    });
  });

  describe('2. RateLimitGuard Evaluation', () => {
    let store;
    let mockConfig;

    beforeEach(async () => {
      store = new RateLimitStore(prisma);
      await store.clear();
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

    it('should derive IP from direct request without trusting arbitrary X-Forwarded-For header', async () => {
      const { context, reflector } = createMockContext({
        ip: '198.51.100.50',
        forwardedFor: '203.0.113.195',
        handlerOptions: { limit: 1, keyPrefix: 'public' },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);
      await guard.canActivate(context);

      // Key must use real connection IP (198.51.100.50), NOT arbitrary client X-Forwarded-For (203.0.113.195)
      const directRecord = await prisma.rateLimit.findUnique({
        where: { key: 'public:ip:198.51.100.50' },
      });
      const spoofedRecord = await prisma.rateLimit.findUnique({
        where: { key: 'public:ip:203.0.113.195' },
      });
      assert.ok(directRecord);
      assert.equal(spoofedRecord, null);
    });

    it('should correctly key off trusted reverse-proxy resolved client IP', async () => {
      const { context, reflector } = createMockContext({
        ip: '203.0.113.195', // Express has resolved this as trusted client IP
        handlerOptions: { limit: 1, keyPrefix: 'public' },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);
      await guard.canActivate(context);

      const trustedRecord = await prisma.rateLimit.findUnique({
        where: { key: 'public:ip:203.0.113.195' },
      });
      assert.ok(trustedRecord);
    });

    it('should prevent IP spoofing and enforce rate limit quota against real client IP', async () => {
      // Client at 198.51.100.1 attempts to bypass rate limit by sending distinct X-Forwarded-For headers
      const { context: req1, reflector: ref1 } = createMockContext({
        ip: '198.51.100.1',
        forwardedFor: '10.0.0.1',
        handlerOptions: { limit: 2, keyPrefix: 'public' },
      });
      const { context: req2 } = createMockContext({
        ip: '198.51.100.1',
        forwardedFor: '10.0.0.2',
        handlerOptions: { limit: 2, keyPrefix: 'public' },
      });
      const { context: req3 } = createMockContext({
        ip: '198.51.100.1',
        forwardedFor: '10.0.0.3',
        handlerOptions: { limit: 2, keyPrefix: 'public' },
      });

      const guard = new RateLimitGuard(store, ref1, mockConfig);
      await guard.canActivate(req1);
      await guard.canActivate(req2);

      // Third request from same physical IP must be blocked despite sending new X-Forwarded-For
      await assert.rejects(
        () => guard.canActivate(req3),
        (err) => {
          assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
          return true;
        }
      );
    });

    it('should prioritize authenticated user identity over client IP for rate limit keying', async () => {
      const { context, reflector } = createMockContext({
        user: { userId: 'student-auth-user-42' },
        ip: '198.51.100.99',
        handlerOptions: { limit: 5, keyPrefix: 'auth_test' },
      });

      const guard = new RateLimitGuard(store, reflector, mockConfig);
      await guard.canActivate(context);

      const userRecord = await prisma.rateLimit.findUnique({
        where: { key: 'auth_test:user:student-auth-user-42' },
      });
      const ipRecord = await prisma.rateLimit.findUnique({
        where: { key: 'auth_test:ip:198.51.100.99' },
      });
      assert.ok(userRecord);
      assert.equal(ipRecord, null);
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
        'max-age=31536000; includeSubDomains; preload'
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

    it('should map plain 422 UnprocessableEntity to UNPROCESSABLE_ENTITY code adhering to docs/API.md', () => {
      const filter = new AllExceptionsFilter({ isProduction: true });
      const { host, getStatusCode, getJsonPayload } = createMockFilterContext();

      const exception = new UnprocessableEntityException(
        'Failed to process uploaded resume text'
      );

      filter.catch(exception, host);

      assert.equal(getStatusCode(), 422);
      assert.deepEqual(getJsonPayload(), {
        success: false,
        error: {
          code: 'UNPROCESSABLE_ENTITY',
          message: 'Failed to process uploaded resume text',
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

    it('should configure trustProxy with production-safe defaults and support overrides', () => {
      // Development / Test default: false
      const devConfig = validateEnvironment({
        ...validBaseEnv,
        NODE_ENV: 'development',
      });
      assert.equal(devConfig.trustProxy, false);

      // Production default: 1 (single-hop reverse proxy)
      const prodConfig = validateEnvironment({
        ...validBaseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
      });
      assert.equal(prodConfig.trustProxy, 1);

      // Explicit overrides
      const overrideTrue = validateEnvironment({
        ...validBaseEnv,
        TRUST_PROXY: 'true',
      });
      assert.equal(overrideTrue.trustProxy, true);

      const overrideFalse = validateEnvironment({
        ...validBaseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        TRUST_PROXY: 'false',
      });
      assert.equal(overrideFalse.trustProxy, false);

      const overrideHops = validateEnvironment({
        ...validBaseEnv,
        TRUST_PROXY: '2',
      });
      assert.equal(overrideHops.trustProxy, 2);

      const overrideSubnet = validateEnvironment({
        ...validBaseEnv,
        TRUST_PROXY: 'loopback, 10.0.0.0/8',
      });
      assert.equal(overrideSubnet.trustProxy, 'loopback, 10.0.0.0/8');
    });
  });
});
