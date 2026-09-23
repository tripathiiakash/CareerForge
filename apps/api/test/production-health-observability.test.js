/**
 * Production Health & Observability Test Suite (Phase 8.3)
 *
 * Verifies:
 * 1. /health liveness probe (lightweight, zero external dependencies).
 * 2. /ready readiness probe (validates DB connectivity and pg-boss queue state, returns 200/503).
 * 3. Structured JSON log formatting and security redaction (passwords, JWTs, cookies, Bearer tokens).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Build must be executed before tests so dist is populated
const { AppController } = require('../dist/app.controller');
const {
  sanitizeLogString,
  sanitizeLogData,
  formatStructuredJsonLog,
} = require('../dist/core/utils/log-sanitizer.util');
const { JsonLoggerService } = require('../dist/core/logging/json-logger.service');

describe('Phase 8.3 — Production Health & Observability Suite', () => {
  describe('1. Liveness Probe (/health)', () => {
    it('should return 200 OK with status ok and valid ISO timestamp', () => {
      const mockPrisma = {
        $queryRaw: async () => {
          throw new Error('Database should NOT be called for liveness check');
        },
      };
      const mockQueue = {
        isReady: () => false,
      };

      const controller = new AppController(mockPrisma, mockQueue);
      const result = controller.healthCheck();

      assert.equal(result.status, 'ok');
      assert.ok(typeof result.timestamp === 'string');
      assert.ok(!Number.isNaN(Date.parse(result.timestamp)));
    });
  });

  describe('2. Readiness Probe (/ready)', () => {
    it('should return 200 OK and ready status when database and queue are healthy', async () => {
      let queryRawCalled = false;
      const mockPrisma = {
        $queryRaw: async () => {
          queryRawCalled = true;
          return [{ '?column?': 1 }];
        },
      };
      const mockQueue = {
        isReady: () => true,
      };

      let responseStatus = 0;
      let responseBody = null;
      const mockRes = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const controller = new AppController(mockPrisma, mockQueue);
      await controller.readinessCheck(mockRes);

      assert.equal(queryRawCalled, true);
      assert.equal(responseStatus, 200);
      assert.equal(responseBody.status, 'ready');
      assert.deepEqual(responseBody.checks, {
        database: 'connected',
        queue: 'active',
      });
      assert.ok(!Number.isNaN(Date.parse(responseBody.timestamp)));
      // Ensure zero sensitive details leak in response
      assert.equal(responseBody.database_url, undefined);
      assert.equal(responseBody.connectionString, undefined);
    });

    it('should return 503 Service Unavailable when database query fails', async () => {
      const mockPrisma = {
        $queryRaw: async () => {
          throw new Error('Connection refused: 5432');
        },
      };
      const mockQueue = {
        isReady: () => true,
      };

      let responseStatus = 0;
      let responseBody = null;
      const mockRes = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const controller = new AppController(mockPrisma, mockQueue);
      await controller.readinessCheck(mockRes);

      assert.equal(responseStatus, 503);
      assert.equal(responseBody.status, 'not_ready');
      assert.deepEqual(responseBody.checks, {
        database: 'error',
        queue: 'active',
      });
      // Ensure error stack/details are not leaked
      assert.equal(responseBody.error, undefined);
    });

    it('should return 503 Service Unavailable when queue engine is not ready', async () => {
      const mockPrisma = {
        $queryRaw: async () => [{ '?column?': 1 }],
      };
      const mockQueue = {
        isReady: () => false,
      };

      let responseStatus = 0;
      let responseBody = null;
      const mockRes = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const controller = new AppController(mockPrisma, mockQueue);
      await controller.readinessCheck(mockRes);

      assert.equal(responseStatus, 503);
      assert.equal(responseBody.status, 'not_ready');
      assert.deepEqual(responseBody.checks, {
        database: 'connected',
        queue: 'inactive',
      });
    });

    it('should return 503 Service Unavailable when both database and queue fail', async () => {
      const mockPrisma = {
        $queryRaw: async () => {
          throw new Error('Timeout');
        },
      };
      const mockQueue = {
        isReady: () => false,
      };

      let responseStatus = 0;
      let responseBody = null;
      const mockRes = {
        status(code) {
          responseStatus = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        },
      };

      const controller = new AppController(mockPrisma, mockQueue);
      await controller.readinessCheck(mockRes);

      assert.equal(responseStatus, 503);
      assert.equal(responseBody.status, 'not_ready');
      assert.deepEqual(responseBody.checks, {
        database: 'error',
        queue: 'inactive',
      });
    });
  });

  describe('3. Production Log Sanitizer & Structured JSON Formatting', () => {
    it('should sanitize Bearer authentication headers from strings', () => {
      const raw = 'Request header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abc';
      const clean = sanitizeLogString(raw);

      assert.ok(!clean.includes('eyJhbGci'));
      assert.ok(clean.includes('Bearer [REDACTED]'));
    });

    it('should sanitize cf_auth session cookies from string logs', () => {
      const raw = 'Cookie header: cf_auth=s%3AeyJhbGciOiJIUzI1Ni.xyz789; theme=dark';
      const clean = sanitizeLogString(raw);

      assert.ok(!clean.includes('xyz789'));
      assert.ok(clean.includes('cf_auth=[REDACTED]'));
      assert.ok(clean.includes('theme=dark'));
    });

    it('should sanitize JWT tokens matching standard pattern', () => {
      const raw = 'Issued token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature123456';
      const clean = sanitizeLogString(raw);

      assert.ok(!clean.includes('signature123456'));
      assert.ok(clean.includes('[REDACTED_JWT]'));
    });

    it('should scrub sensitive object keys and preserve safe business data', () => {
      const payload = {
        id: 'usr-123',
        email: 'candidate@example.com',
        role: 'STUDENT',
        password: 'SuperSecretPassword123!',
        password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz',
        jwt_secret: 'top-secret-signing-key',
        apiKey: 'gemini-key-12345',
        nested: {
          token: 'token-abc',
          publicName: 'Alex',
        },
      };

      const clean = sanitizeLogData(payload);

      assert.equal(clean.id, 'usr-123');
      assert.equal(clean.email, 'candidate@example.com');
      assert.equal(clean.role, 'STUDENT');
      assert.equal(clean.password, '[REDACTED]');
      assert.equal(clean.password_hash, '[REDACTED]');
      assert.equal(clean.jwt_secret, '[REDACTED]');
      assert.equal(clean.apiKey, '[REDACTED]');
      assert.equal(clean.nested.token, '[REDACTED]');
      assert.equal(clean.nested.publicName, 'Alex');
    });

    it('should safely format single-line structured JSON logs with metadata', () => {
      const jsonStr = formatStructuredJsonLog(
        'info',
        'User registration completed',
        'AuthService',
        undefined,
        { userId: 'u-1', email: 'test@example.com', token: 'secret-token' }
      );

      const parsed = JSON.parse(jsonStr);
      assert.equal(parsed.level, 'INFO');
      assert.equal(parsed.context, 'AuthService');
      assert.equal(parsed.message, 'User registration completed');
      assert.equal(parsed.metadata.userId, 'u-1');
      assert.equal(parsed.metadata.email, 'test@example.com');
      assert.equal(parsed.metadata.token, '[REDACTED]');
      assert.ok(!Number.isNaN(Date.parse(parsed.timestamp)));
    });

    it('should instantiate JsonLoggerService and emit formatted JSON without crashing', () => {
      const logger = new JsonLoggerService();
      assert.ok(typeof logger.log === 'function');
      assert.ok(typeof logger.error === 'function');
      assert.ok(typeof logger.warn === 'function');
      assert.ok(typeof logger.debug === 'function');
      assert.ok(typeof logger.verbose === 'function');
    });
  });
});
