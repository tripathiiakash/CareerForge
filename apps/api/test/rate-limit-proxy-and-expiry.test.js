/**
 * Rate-Limit Resolution, Proxy Trust & Expiry Regression Suite
 *
 * Verifies:
 * 1. Client IP normalization (IPv4-mapped IPv6 ::ffff:, loopback ::1).
 * 2. Multi-hop proxy resolution via Cloudflare Pages Function + Render edge.
 * 3. Origin trust boundary defense (anti-spoofing of X-Forwarded-For on direct calls).
 * 4. Quota isolation between distinct client IPs behind the same proxy.
 * 5. RateLimitStore expiration, stale record unblocking, and defensive clock-skew guards.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const proxyaddr = require('proxy-addr');
const { HttpStatus, HttpException } = require('@nestjs/common');

const {
  DEFAULT_PRODUCTION_TRUST_PROXY,
  CLOUDFLARE_PROXY_CIDRS,
  validateEnvironment,
} = require('../dist/core/config/config.validator');
const { ConfigService } = require('../dist/core/config/config.service');
const {
  RateLimitGuard,
  normalizeIp,
  safeCompareSecret,
  isValidIp,
  PROXY_AUTH_HEADER,
  PROXY_VISITOR_IP_HEADER,
} = require('../dist/core/rate-limit/rate-limit.guard');
const { RateLimitStore } = require('../dist/core/rate-limit/rate-limit.store');
const {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
} = require('../dist/core/rate-limit/rate-limit.decorator');

describe('Rate-Limit Proxy Trust, IP Resolution & Expiry Regression Suite', () => {
  describe('1. Client IP Normalization (normalizeIp)', () => {
    it('should strip IPv4-mapped IPv6 prefix (::ffff:)', () => {
      assert.equal(normalizeIp('::ffff:203.0.113.195'), '203.0.113.195');
      assert.equal(normalizeIp('::ffff:10.237.24.133'), '10.237.24.133');
      assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
    });

    it('should normalize IPv6 loopback (::1) to 127.0.0.1', () => {
      assert.equal(normalizeIp('::1'), '127.0.0.1');
    });

    it('should preserve standard IPv4 addresses', () => {
      assert.equal(normalizeIp('198.51.100.10'), '198.51.100.10');
      assert.equal(normalizeIp('10.0.0.1'), '10.0.0.1');
    });

    it('should preserve standard IPv6 addresses', () => {
      assert.equal(normalizeIp('2606:4700:4700::1111'), '2606:4700:4700::1111');
      assert.equal(normalizeIp('2a06:98c0:3600::103'), '2a06:98c0:3600::103');
    });

    it('should trim surrounding whitespace', () => {
      assert.equal(normalizeIp('  203.0.113.195  '), '203.0.113.195');
      assert.equal(normalizeIp('  ::ffff:192.0.2.1  '), '192.0.2.1');
    });

    it('should fall back to 127.0.0.1 for null, undefined, or empty strings', () => {
      assert.equal(normalizeIp(undefined), '127.0.0.1');
      assert.equal(normalizeIp(null), '127.0.0.1');
      assert.equal(normalizeIp(''), '127.0.0.1');
      assert.equal(normalizeIp('   '), '127.0.0.1');
    });
  });

  describe('2. Multi-Hop Proxy Resolution (Cloudflare Pages + Render)', () => {
    let app;
    let trustFn;

    beforeEach(() => {
      app = express();
      app.set('trust proxy', DEFAULT_PRODUCTION_TRUST_PROXY);
      trustFn = app.get('trust proxy fn');
    });

    it('should resolve real client IP behind Cloudflare IPv4 worker and Render internal router', () => {
      // Browser Client IP: 203.0.113.195
      // Cloudflare Pages outbound worker IP: 162.158.5.10 (within 162.158.0.0/15)
      // Render private router: 10.237.24.133 (within 10.0.0.0/8)
      const req = {
        connection: { remoteAddress: '10.237.24.133' },
        headers: {
          'x-forwarded-for': '203.0.113.195, 162.158.5.10',
        },
      };

      const resolvedIp = proxyaddr(req, trustFn);
      assert.equal(resolvedIp, '203.0.113.195');
    });

    it('should resolve real client IP behind Cloudflare IPv6 worker and Render internal router', () => {
      // Browser Client IP: 203.0.113.195
      // Cloudflare Pages outbound worker IPv6: 2a06:98c0:3600::103 (within 2a06:98c0::/29)
      // Render private router: 10.29.45.168 (within 10.0.0.0/8)
      const req = {
        connection: { remoteAddress: '10.29.45.168' },
        headers: {
          'x-forwarded-for': '203.0.113.195, 2a06:98c0:3600::103',
        },
      };

      const resolvedIp = proxyaddr(req, trustFn);
      assert.equal(resolvedIp, '203.0.113.195');
    });

    it('should isolate distinct client IPs arriving through the same Cloudflare proxy', () => {
      const reqA = {
        connection: { remoteAddress: '10.237.24.133' },
        headers: {
          'x-forwarded-for': '203.0.113.195, 162.158.5.10',
        },
      };

      const reqB = {
        connection: { remoteAddress: '10.237.24.133' },
        headers: {
          'x-forwarded-for': '198.51.100.55, 162.158.5.10',
        },
      };

      const ipA = proxyaddr(reqA, trustFn);
      const ipB = proxyaddr(reqB, trustFn);

      assert.equal(ipA, '203.0.113.195');
      assert.equal(ipB, '198.51.100.55');
      assert.notEqual(ipA, ipB);
    });

    it('should handle IPv4-mapped IPv6 socket addresses in dual-stack Render containers', () => {
      const req = {
        connection: { remoteAddress: '::ffff:10.237.24.133' },
        headers: {
          'x-forwarded-for': '203.0.113.195, 162.158.5.10',
        },
      };

      const resolvedIp = proxyaddr(req, trustFn);
      assert.equal(normalizeIp(resolvedIp), '203.0.113.195');
    });
  });

  describe('3. Origin Trust Boundary Defense (Anti-Spoofing on Direct Calls)', () => {
    let app;
    let trustFn;

    beforeEach(() => {
      app = express();
      app.set('trust proxy', DEFAULT_PRODUCTION_TRUST_PROXY);
      trustFn = app.get('trust proxy fn');
    });

    it('should strictly reject spoofed X-Forwarded-For headers from direct callers to Render', () => {
      // Attacker connects directly to Render from 198.51.100.42 (not Cloudflare)
      // Attacker sends: X-Forwarded-For: 8.8.8.8
      // Render proxy appends attacker IP to header: '8.8.8.8, 198.51.100.42'
      const req = {
        connection: { remoteAddress: '10.237.24.133' },
        headers: {
          'x-forwarded-for': '8.8.8.8, 198.51.100.42',
        },
      };

      const resolvedIp = proxyaddr(req, trustFn);
      // Must halt on 198.51.100.42 because it is NOT trusted
      assert.equal(resolvedIp, '198.51.100.42');
      assert.notEqual(resolvedIp, '8.8.8.8');
    });

    it('should strictly reject direct caller attempting to spoof Cloudflare proxy IP', () => {
      // Attacker connects directly from 198.51.100.42, sending X-Forwarded-For: 162.158.5.10
      // Render appends attacker IP: '162.158.5.10, 198.51.100.42'
      const req = {
        connection: { remoteAddress: '10.237.24.133' },
        headers: {
          'x-forwarded-for': '162.158.5.10, 198.51.100.42',
        },
      };

      const resolvedIp = proxyaddr(req, trustFn);
      // The direct connection IP is untrusted, so proxyaddr halts immediately
      assert.equal(resolvedIp, '198.51.100.42');
      assert.notEqual(resolvedIp, '162.158.5.10');
    });

    it('should strictly reject chained spoofing attempts', () => {
      const req = {
        connection: { remoteAddress: '10.237.24.133' },
        headers: {
          'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.42',
        },
      };

      const resolvedIp = proxyaddr(req, trustFn);
      assert.equal(resolvedIp, '198.51.100.42');
    });
  });

  describe('4. RateLimitStore Expiry, Stale Records & Clock Skew Defense', () => {
    it('should not block if totalHits > limit but window has expired (nowMs >= resetAtMs)', async () => {
      // Simulate mock Prisma returning a record where hits exceeded limit,
      // but reset_at is in the past (e.g. 4-day-old record)
      const pastResetAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago
      const mockPrisma = {
        $queryRaw: async () => [
          {
            hits: 15, // Stale hit count
            reset_at: pastResetAt,
          },
        ],
      };

      const store = new RateLimitStore(mockPrisma);
      const result = await store.increment('auth:ip:10.29.45.168', 10, 60);

      // Defensive guard: totalHits > limit && nowMs < resetAtMs
      // Since nowMs >= resetAtMs (4 days past), isBlocked MUST be false
      assert.equal(result.isBlocked, false);
      assert.equal(result.totalHits, 15);
    });

    it('should correctly block when totalHits > limit and window is active (nowMs < resetAtMs)', async () => {
      const futureResetAt = new Date(Date.now() + 45000); // 45s in future
      const mockPrisma = {
        $queryRaw: async () => [
          {
            hits: 11,
            reset_at: futureResetAt,
          },
        ],
      };

      const store = new RateLimitStore(mockPrisma);
      const result = await store.increment('auth:ip:203.0.113.195', 10, 60);

      assert.equal(result.isBlocked, true);
      assert.equal(result.totalHits, 11);
      assert.equal(result.remaining, 0);
      assert.ok(result.retryAfterSeconds > 0 && result.retryAfterSeconds <= 60);
    });

    it('should simulate 4-day-old stale record reset on next increment', async () => {
      // In PostgreSQL: WHEN reset_at <= now THEN 1 ELSE hits + 1
      // When a 4-day stale record is updated, the SQL CASE resets hits to 1
      let storedHits = 25;
      let storedResetAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

      const mockPrisma = {
        $queryRaw: async (strings, ...values) => {
          const now = values[3];
          const newResetAt = values[2];

          // Simulate PostgreSQL CASE WHEN reset_at <= now
          if (storedResetAt <= now) {
            storedHits = 1;
            storedResetAt = newResetAt;
          } else {
            storedHits += 1;
          }

          return [{ hits: storedHits, reset_at: storedResetAt }];
        },
      };

      const store = new RateLimitStore(mockPrisma);
      const result = await store.increment('auth:ip:10.29.45.168', 10, 60);

      // Result must be reset to 1 hit, unblocked, with 9 remaining
      assert.equal(result.totalHits, 1);
      assert.equal(result.remaining, 9);
      assert.equal(result.isBlocked, false);
      assert.ok(result.resetAt > Math.floor(Date.now() / 1000));
    });
  });

  describe('5. RateLimitGuard Quota Isolation with Mock Store', () => {
    let mockStore;
    let mockConfig;

    beforeEach(() => {
      const hitMap = new Map();
      mockStore = {
        async increment(key, limit, ttlSeconds) {
          const current = hitMap.get(key) || { hits: 0, resetAt: Date.now() + ttlSeconds * 1000 };
          current.hits += 1;
          hitMap.set(key, current);

          const isBlocked = current.hits > limit;
          return {
            totalHits: current.hits,
            remaining: Math.max(0, limit - current.hits),
            resetAt: Math.ceil(current.resetAt / 1000),
            isBlocked,
            retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - Date.now()) / 1000)),
          };
        },
      };

      mockConfig = {
        rateLimitEnabled: true,
        rateLimitGlobalMax: 120,
        rateLimitWindowSeconds: 60,
      };
    });

    function createMockContext(ip, options = { limit: 2, ttlSeconds: 60, keyPrefix: 'auth' }) {
      const responseHeaders = {};
      const req = {
        ip,
        headers: {},
        socket: { remoteAddress: ip },
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
          if (key === SKIP_RATE_LIMIT_KEY) return false;
          if (key === RATE_LIMIT_KEY) return options;
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
      return { context, responseHeaders, req };
    }

    it('should isolate rate limits for two different client IPs behind the same proxy', async () => {
      const reflector = {
        getAllAndOverride(key) {
          if (key === SKIP_RATE_LIMIT_KEY) return false;
          if (key === RATE_LIMIT_KEY) return { limit: 2, ttlSeconds: 60, keyPrefix: 'auth' };
          return undefined;
        },
      };

      const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

      // Client A makes 2 requests (limit=2)
      const ctxA1 = createMockContext('203.0.113.195');
      const ctxA2 = createMockContext('203.0.113.195');
      const ctxA3 = createMockContext('203.0.113.195');

      assert.equal(await guard.canActivate(ctxA1.context), true);
      assert.equal(await guard.canActivate(ctxA2.context), true);

      // Client A's 3rd request is blocked
      await assert.rejects(
        () => guard.canActivate(ctxA3.context),
        (err) => err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      );

      // Client B from different IP behind the same proxy is NOT blocked
      const ctxB1 = createMockContext('198.51.100.55');
      const allowedB = await guard.canActivate(ctxB1.context);
      assert.equal(allowedB, true);
      assert.equal(ctxB1.responseHeaders['X-RateLimit-Remaining'], 1);
    });

    it('should normalize IPv4-mapped IPv6 so ::ffff:203.0.113.195 shares quota with 203.0.113.195', async () => {
      const reflector = {
        getAllAndOverride(key) {
          if (key === SKIP_RATE_LIMIT_KEY) return false;
          if (key === RATE_LIMIT_KEY) return { limit: 2, ttlSeconds: 60, keyPrefix: 'auth' };
          return undefined;
        },
      };

      const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

      const ctx1 = createMockContext('203.0.113.195');
      const ctx2 = createMockContext('::ffff:203.0.113.195');
      const ctx3 = createMockContext('203.0.113.195');

      assert.equal(await guard.canActivate(ctx1.context), true);
      assert.equal(await guard.canActivate(ctx2.context), true);

      // 3rd hit (from same normalized IP) is blocked
      await assert.rejects(
        () => guard.canActivate(ctx3.context),
        (err) => err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      );
    });
  });

  describe('6. Environment Validation & Trust Proxy Defaults', () => {
    const validBase = {
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
      JWT_SECRET: 'a'.repeat(32),
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_S3_BUCKET_NAME: 'test-bucket',
    };

    it('should default trustProxy to DEFAULT_PRODUCTION_TRUST_PROXY in production', () => {
      const config = validateEnvironment({
        ...validBase,
        NODE_ENV: 'production',
      });
      assert.equal(config.trustProxy, DEFAULT_PRODUCTION_TRUST_PROXY);
      assert.ok(config.trustProxy.includes('10.0.0.0/8'));
      assert.ok(config.trustProxy.includes('162.158.0.0/15'));
      assert.ok(config.trustProxy.includes('2a06:98c0::/29'));
    });

    it('should default trustProxy to false in development/test', () => {
      const devConfig = validateEnvironment({
        ...validBase,
        NODE_ENV: 'development',
      });
      assert.equal(devConfig.trustProxy, false);

      const testConfig = validateEnvironment({
        ...validBase,
        NODE_ENV: 'test',
      });
      assert.equal(testConfig.trustProxy, false);
    });

    it('should respect explicit TRUST_PROXY overrides', () => {
      const overrideTrue = validateEnvironment({
        ...validBase,
        TRUST_PROXY: 'true',
      });
      assert.equal(overrideTrue.trustProxy, true);

      const overrideFalse = validateEnvironment({
        ...validBase,
        NODE_ENV: 'production',
        TRUST_PROXY: 'false',
      });
      assert.equal(overrideFalse.trustProxy, false);

      const overrideHops = validateEnvironment({
        ...validBase,
        TRUST_PROXY: '2',
      });
      assert.equal(overrideHops.trustProxy, 2);
    });

    it('should parse PROXY_SHARED_SECRET and CF_PROXY_SECRET from environment', () => {
      const config1 = validateEnvironment({
        ...validBase,
        PROXY_SHARED_SECRET: 'my-custom-proxy-secret',
      });
      assert.equal(config1.proxySharedSecret, 'my-custom-proxy-secret');

      const config2 = validateEnvironment({
        ...validBase,
        CF_PROXY_SECRET: 'legacy-alias-secret',
      });
      assert.equal(config2.proxySharedSecret, 'legacy-alias-secret');

      const configEmpty = validateEnvironment({
        ...validBase,
      });
      assert.equal(configEmpty.proxySharedSecret, undefined);
    });
  });

  describe('7. Authenticated Proxy Boundary (PROXY_SHARED_SECRET & x-cf-visitor-ip)', () => {
    describe('safeCompareSecret (Constant-Time Comparison)', () => {
      it('should return true for identical secrets', () => {
        assert.equal(safeCompareSecret('correct-secret', 'correct-secret'), true);
      });

      it('should return false for mismatched secrets', () => {
        assert.equal(safeCompareSecret('wrong-secret', 'correct-secret'), false);
      });

      it('should return false for different length secrets without throwing', () => {
        assert.equal(safeCompareSecret('short', 'much-longer-secret-value'), false);
        assert.equal(safeCompareSecret('longer-secret-value', 'short'), false);
      });

      it('should return false for null, undefined, or empty values', () => {
        assert.equal(safeCompareSecret(null, 'secret'), false);
        assert.equal(safeCompareSecret('secret', null), false);
        assert.equal(safeCompareSecret(undefined, 'secret'), false);
        assert.equal(safeCompareSecret('', 'secret'), false);
        assert.equal(safeCompareSecret('secret', ''), false);
      });
    });

    describe('isValidIp', () => {
      it('should return true for valid IPv4 addresses', () => {
        assert.equal(isValidIp('203.0.113.195'), true);
        assert.equal(isValidIp('127.0.0.1'), true);
        assert.equal(isValidIp('  192.168.1.1  '), true);
      });

      it('should return true for valid IPv6 addresses', () => {
        assert.equal(isValidIp('2001:db8::1'), true);
        assert.equal(isValidIp('::1'), true);
        assert.equal(isValidIp('2606:4700:4700::1111'), true);
      });

      it('should return true for IPv4-mapped IPv6 addresses', () => {
        assert.equal(isValidIp('::ffff:203.0.113.195'), true);
      });

      it('should return false for invalid IP syntax, injections, or multi-IP chains', () => {
        assert.equal(isValidIp('not-an-ip'), false);
        assert.equal(isValidIp('1.2.3.4, 5.6.7.8'), false);
        assert.equal(isValidIp('8.8.8.8; DROP TABLE rate_limits'), false);
        assert.equal(isValidIp('<script>alert(1)</script>'), false);
        assert.equal(isValidIp(''), false);
        assert.equal(isValidIp(null), false);
        assert.equal(isValidIp(undefined), false);
      });
    });

    describe('RateLimitGuard Authenticated Header Attribution', () => {
      let hitMap;
      let mockStore;
      const SERVER_SECRET = 'super-secret-proxy-auth-key-32ch';

      beforeEach(() => {
        hitMap = new Map();
        mockStore = {
          async increment(key, limit, ttlSeconds) {
            const current = hitMap.get(key) || { hits: 0, resetAt: Date.now() + ttlSeconds * 1000 };
            current.hits += 1;
            hitMap.set(key, current);

            const isBlocked = current.hits > limit;
            return {
              totalHits: current.hits,
              remaining: Math.max(0, limit - current.hits),
              resetAt: Math.ceil(current.resetAt / 1000),
              isBlocked,
              retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - Date.now()) / 1000)),
            };
          },
        };
      });

      function createAuthenticatedContext({
        socketIp = '10.237.24.133',
        proxySecret,
        visitorIp,
        extraHeaders = {},
        options = { limit: 2, ttlSeconds: 60, keyPrefix: 'auth' },
      }) {
        const headers = { ...extraHeaders };
        if (proxySecret !== undefined) {
          headers[PROXY_AUTH_HEADER] = proxySecret;
        }
        if (visitorIp !== undefined) {
          headers[PROXY_VISITOR_IP_HEADER] = visitorIp;
        }

        const responseHeaders = {};
        const req = {
          ip: socketIp,
          headers,
          socket: { remoteAddress: socketIp },
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
            if (key === SKIP_RATE_LIMIT_KEY) return false;
            if (key === RATE_LIMIT_KEY) return options;
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
        return { context, responseHeaders, req };
      }

      it('should trust visitor-IP header when proxy secret is valid and key rate limit to that IP', async () => {
        const mockConfig = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: SERVER_SECRET,
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 2, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

        const ctx = createAuthenticatedContext({
          socketIp: '10.237.24.133', // Render private router IP
          proxySecret: SERVER_SECRET, // Valid secret from Cloudflare Pages Function
          visitorIp: '203.0.113.195', // Verified client IP
        });

        await guard.canActivate(ctx.context);

        // Counter must be keyed to the verified visitor IP, NOT the socket IP (10.237.24.133)
        assert.ok(hitMap.has('auth:ip:203.0.113.195'));
        assert.equal(hitMap.get('auth:ip:203.0.113.195').hits, 1);
        assert.ok(!hitMap.has('auth:ip:10.237.24.133'));
      });

      it('should normalize IPv4-mapped IPv6 addresses in authenticated visitor-IP header', async () => {
        const mockConfig = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: SERVER_SECRET,
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 5, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

        const ctx = createAuthenticatedContext({
          socketIp: '10.237.24.133',
          proxySecret: SERVER_SECRET,
          visitorIp: '::ffff:203.0.113.195',
        });

        await guard.canActivate(ctx.context);

        // Must strip ::ffff: prefix and key to clean IPv4
        assert.ok(hitMap.has('auth:ip:203.0.113.195'));
      });

      it('should ignore visitor-IP header when proxy secret is invalid and fall back to socket IP', async () => {
        const mockConfig = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: SERVER_SECRET,
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 5, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

        // Attacker attempts to forge visitor IP with invalid secret
        const ctx = createAuthenticatedContext({
          socketIp: '198.51.100.42',
          proxySecret: 'wrong-attacker-secret',
          visitorIp: '8.8.8.8',
        });

        await guard.canActivate(ctx.context);

        // Key must fall back to attacker socket IP (198.51.100.42), NOT spoofed 8.8.8.8
        assert.ok(hitMap.has('auth:ip:198.51.100.42'));
        assert.ok(!hitMap.has('auth:ip:8.8.8.8'));
      });

      it('should ignore visitor-IP header when proxy secret is missing (direct unauthenticated calls)', async () => {
        const mockConfig = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: SERVER_SECRET,
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 5, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

        // Attacker connects directly, omitting secret, sending visitor-IP header
        const ctx = createAuthenticatedContext({
          socketIp: '198.51.100.42',
          proxySecret: undefined, // No secret provided
          visitorIp: '8.8.8.8',
        });

        await guard.canActivate(ctx.context);

        // Key must fall back to socket IP, ignoring custom header
        assert.ok(hitMap.has('auth:ip:198.51.100.42'));
        assert.ok(!hitMap.has('auth:ip:8.8.8.8'));
      });

      it('should ignore visitor-IP header when IP syntax is invalid or malicious', async () => {
        const mockConfig = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: SERVER_SECRET,
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 5, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

        // Even with valid secret, if visitor IP is malformed/injected, fall back to socket IP
        const ctx = createAuthenticatedContext({
          socketIp: '10.237.24.133',
          proxySecret: SERVER_SECRET,
          visitorIp: 'not-an-ip-injection-string',
        });

        await guard.canActivate(ctx.context);

        assert.ok(hitMap.has('auth:ip:10.237.24.133'));
        assert.ok(!hitMap.has('auth:ip:not-an-ip-injection-string'));
      });

      it('should ignore custom headers when proxySharedSecret is not configured on server', async () => {
        const mockConfigWithoutSecret = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: undefined, // Not configured
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 5, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfigWithoutSecret);

        const ctx = createAuthenticatedContext({
          socketIp: '198.51.100.42',
          proxySecret: 'any-secret',
          visitorIp: '8.8.8.8',
        });

        await guard.canActivate(ctx.context);

        assert.ok(hitMap.has('auth:ip:198.51.100.42'));
        assert.ok(!hitMap.has('auth:ip:8.8.8.8'));
      });

      it('should isolate rate-limit buckets for different visitors behind the authenticated proxy', async () => {
        const mockConfig = {
          rateLimitEnabled: true,
          rateLimitGlobalMax: 120,
          rateLimitWindowSeconds: 60,
          proxySharedSecret: SERVER_SECRET,
        };

        const reflector = {
          getAllAndOverride: (key) => (key === RATE_LIMIT_KEY ? { limit: 2, ttlSeconds: 60, keyPrefix: 'auth' } : undefined),
        };
        const guard = new RateLimitGuard(mockStore, reflector, mockConfig);

        // Visitor A makes 2 attempts from behind Cloudflare Pages
        const ctxA1 = createAuthenticatedContext({ socketIp: '10.237.24.133', proxySecret: SERVER_SECRET, visitorIp: '203.0.113.195' });
        const ctxA2 = createAuthenticatedContext({ socketIp: '10.237.24.133', proxySecret: SERVER_SECRET, visitorIp: '203.0.113.195' });
        const ctxA3 = createAuthenticatedContext({ socketIp: '10.237.24.133', proxySecret: SERVER_SECRET, visitorIp: '203.0.113.195' });

        assert.equal(await guard.canActivate(ctxA1.context), true);
        assert.equal(await guard.canActivate(ctxA2.context), true);

        // Visitor A exceeds quota
        await assert.rejects(
          () => guard.canActivate(ctxA3.context),
          (err) => err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS
        );

        // Visitor B on different verified IP behind the same Cloudflare Pages Function is NOT blocked
        const ctxB1 = createAuthenticatedContext({ socketIp: '10.237.24.133', proxySecret: SERVER_SECRET, visitorIp: '198.51.100.55' });
        assert.equal(await guard.canActivate(ctxB1.context), true);
        assert.equal(ctxB1.responseHeaders['X-RateLimit-Remaining'], 1);
      });
    });
  });
});
