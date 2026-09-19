/**
 * Phase 6.6-F: API Exception-Envelope & HTTP Contract Integration Test Suite
 *
 * Exercises the end-to-end NestJS HTTP pipeline:
 *   actual HTTP request -> middleware -> guards -> pipes -> controller -> AllExceptionsFilter -> JSON response
 *
 * Verifies strict conformance to docs/API.md:
 * 1. Standard Success Envelope: { success: true, data: ... }
 * 2. Standard Error Envelope:   { success: false, error: { code: string, message: string, details?: unknown } }
 * 3. HTTP status mappings: 200, 201, 400, 401, 403, 404, 409, 413, 422, 429, 500
 * 4. Production error sanitization & zero information leakage (stack traces, SQL, passwords, tokens, paths)
 * 5. Defense-in-depth security headers & CSRF protection
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const {
  Module,
  Controller,
  Get,
  Post,
  UseGuards,
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const express = require('express');
const cookieParser = require('cookie-parser');

// Production Pipeline Components
const { AllExceptionsFilter } = require('../dist/core/filters/all-exceptions.filter');
const { JwtAuthGuard } = require('../dist/core/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { RateLimitGuard } = require('../dist/core/rate-limit/rate-limit.guard');
const { RateLimit } = require('../dist/core/rate-limit/rate-limit.decorator');
const { RateLimitStore } = require('../dist/core/rate-limit/rate-limit.store');
const { SecurityHeadersMiddleware } = require('../dist/core/middleware/security-headers.middleware');
const { CsrfMiddleware } = require('../dist/core/middleware/csrf.middleware');
const { ConfigService } = require('../dist/core/config/config.service');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { TokenService } = require('../dist/modules/auth/token.service');

// Production Controllers
const { AuthController } = require('../dist/modules/auth/auth.controller');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { StudentController } = require('../dist/modules/student/student.controller');
const { StudentService } = require('../dist/modules/student/student.service');
const { ApplicationService } = require('../dist/modules/application/application.service');

// ---------------------------------------------------------------------------
// Test Configuration & Mock Dependencies
// ---------------------------------------------------------------------------

const TEST_JWT_SECRET = 'cf-test-jwt-secret-key-32-chars-long-strictly-for-contract-tests';
const ALLOWED_CORS_ORIGIN = 'http://localhost:3000';

const testConfig = {
  isProduction: true,
  nodeEnv: 'production',
  port: 0,
  jwtSecret: TEST_JWT_SECRET,
  jwtExpiresIn: '1h',
  authCookieName: 'cf_auth',
  authCookieMaxAgeSec: 604800,
  corsOrigin: ALLOWED_CORS_ORIGIN,
  trustProxy: false,
  rateLimitEnabled: true,
  rateLimitGlobalMax: 100,
  rateLimitWindowSeconds: 60,
};

// In-Memory Rate Limit Store for Focused HTTP Rate-Limit Testing
class InMemoryRateLimitStore {
  constructor() {
    this.hits = new Map();
  }

  async increment(key, limit, ttlSeconds) {
    const current = (this.hits.get(key) || 0) + 1;
    this.hits.set(key, current);
    const isBlocked = current > limit;
    return {
      hits: current,
      remaining: Math.max(0, limit - current),
      resetAt: Math.floor(Date.now() / 1000) + ttlSeconds,
      isBlocked,
      retryAfterSeconds: isBlocked ? ttlSeconds : 0,
    };
  }

  reset() {
    this.hits.clear();
  }
}

const mockAuthService = {
  register: async (dto) => {
    if (dto.email === 'duplicate@example.com') {
      const { ConflictException } = require('@nestjs/common');
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Email is already registered',
      });
    }
    return {
      user_id: 'user-uuid-registered',
      email: dto.email,
      role: dto.role,
      token: 'mock-signed-jwt-token-register',
    };
  },
  login: async (dto) => {
    return {
      user_id: 'user-uuid-logged-in',
      email: dto.email,
      role: 'STUDENT',
      token: 'mock-signed-jwt-token-login',
    };
  },
};

const mockStudentService = {
  getProfileByUserId: async (userId) => {
    if (userId === 'missing-student-id') {
      const { NotFoundException } = require('@nestjs/common');
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Student profile not found',
      });
    }
    return {
      id: 'student-profile-uuid',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+1-555-0199',
      linkedin_url: 'https://linkedin.com/in/janedoe',
      github_url: 'https://github.com/janedoe',
      university: 'Tech Institute',
      graduation_year: 2026,
      skills: ['typescript', 'node.js', 'postgresql'],
    };
  },
  updateProfileByUserId: async (_userId, dto) => {
    return {
      id: 'student-profile-uuid',
      first_name: dto.first_name || 'Jane',
      last_name: dto.last_name || 'Doe',
      phone: dto.phone || null,
      linkedin_url: dto.linkedin_url || null,
      github_url: dto.github_url || null,
      university: dto.university || null,
      graduation_year: dto.graduation_year || null,
      skills: dto.skills || ['typescript'],
    };
  },
};

const mockApplicationService = {
  listStudentApplications: async () => ({
    applications: [],
    meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
  }),
};

const mockPrismaService = {
  user: {
    findUnique: async ({ where }) => {
      if (where.id === 'banned-student-id') {
        return { is_banned: true };
      }
      return { is_banned: false };
    },
  },
};

// ---------------------------------------------------------------------------
// Controlled Probe Controller for 500, 422, 413 & 429 Status Verification
// ---------------------------------------------------------------------------

class ContractProbeController {
  error500Database() {
    throw new Error(
      'FATAL: password authentication failed for user "careerforge_admin" at postgresql://careerforge_admin:P@ssw0rd123!@db-cluster.internal:5432/careerforge_prod'
    );
  }

  error500Filesystem() {
    throw new Error(
      'ENOENT: no such file or directory, open "C:\\Users\\tripa\\Desktop\\Akash\\PROJECTS\\careerForge\\secrets\\master-key.pem"'
    );
  }

  error500Prisma() {
    throw new Error(
      'PrismaClientKnownRequestError: Invalid `prisma.user.findUnique()` invocation: SELECT * FROM "users" WHERE "password_hash" = $1'
    );
  }

  error422EmptyPdf() {
    throw new UnprocessableEntityException({
      code: 'EMPTY_PDF_CONTENT',
      message:
        'The PDF document contains no readable text (it may be image-only or scanned).',
    });
  }

  error422Generic() {
    throw new UnprocessableEntityException('Unable to process semantic payload');
  }

  error413Payload() {
    throw new HttpException(
      'Request payload exceeds size limit',
      HttpStatus.PAYLOAD_TOO_LARGE
    );
  }

  rateLimitedRoute() {
    return { success: true, data: { status: 'rate-limit-pass' } };
  }
}

// Decorate ContractProbeController methods
Reflect.decorate(
  [Get('error-500-db')],
  ContractProbeController.prototype,
  'error500Database',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'error500Database')
);
Reflect.decorate(
  [Get('error-500-fs')],
  ContractProbeController.prototype,
  'error500Filesystem',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'error500Filesystem')
);
Reflect.decorate(
  [Get('error-500-prisma')],
  ContractProbeController.prototype,
  'error500Prisma',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'error500Prisma')
);
Reflect.decorate(
  [Get('error-422-pdf')],
  ContractProbeController.prototype,
  'error422EmptyPdf',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'error422EmptyPdf')
);
Reflect.decorate(
  [Get('error-422-generic')],
  ContractProbeController.prototype,
  'error422Generic',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'error422Generic')
);
Reflect.decorate(
  [Get('error-413-payload')],
  ContractProbeController.prototype,
  'error413Payload',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'error413Payload')
);
Reflect.decorate(
  [
    Get('rate-limited'),
    RateLimit({ limit: 2, ttlSeconds: 60, keyPrefix: 'probe-rate' }),
    UseGuards(RateLimitGuard),
  ],
  ContractProbeController.prototype,
  'rateLimitedRoute',
  Object.getOwnPropertyDescriptor(ContractProbeController.prototype, 'rateLimitedRoute')
);
Reflect.decorate([Controller('contract-probe')], ContractProbeController);

// ---------------------------------------------------------------------------
// Test Nest Module
// ---------------------------------------------------------------------------

class HttpContractTestModule {}
Reflect.decorate(
  [
    Module({
      controllers: [AuthController, StudentController, ContractProbeController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: StudentService, useValue: mockStudentService },
        { provide: ApplicationService, useValue: mockApplicationService },
        { provide: ConfigService, useValue: testConfig },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RateLimitStore, useClass: InMemoryRateLimitStore },
        JwtService,
        TokenService,
        JwtAuthGuard,
        RolesGuard,
        RateLimitGuard,
      ],
    }),
  ],
  HttpContractTestModule
);

// ---------------------------------------------------------------------------
// Helper: Invariant Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts standard Success Envelope invariants specified in docs/API.md
 */
function assertSuccessEnvelope(body, expectedStatus, actualStatus) {
  assert.equal(actualStatus, expectedStatus, `Expected HTTP status ${expectedStatus}`);
  assert.equal(typeof body, 'object', 'Response body must be a JSON object');
  assert.notEqual(body, null, 'Response body must not be null');
  assert.equal(body.success, true, 'Envelope field "success" must strictly be true');
  assert.notEqual(body.data, undefined, 'Envelope field "data" must be present');
  assert.equal(body.error, undefined, 'Envelope field "error" must not exist on success');
}

/**
 * Asserts standard Error Envelope invariants specified in docs/API.md
 */
function assertErrorEnvelope(body, expectedStatus, actualStatus, expectedCode) {
  assert.equal(actualStatus, expectedStatus, `Expected HTTP status ${expectedStatus}`);
  assert.equal(typeof body, 'object', 'Response body must be a JSON object');
  assert.notEqual(body, null, 'Response body must not be null');
  assert.equal(body.success, false, 'Envelope field "success" must strictly be false');
  assert.equal(typeof body.error, 'object', 'Envelope field "error" must be an object');
  assert.notEqual(body.error, null, 'Envelope field "error" must not be null');
  assert.equal(typeof body.error.code, 'string', 'Error code must be a string');
  if (expectedCode) {
    assert.equal(body.error.code, expectedCode, `Expected error code ${expectedCode}`);
  }
  assert.equal(typeof body.error.message, 'string', 'Error message must be a string');
  assert.notEqual(body.error.message.trim(), '', 'Error message must not be empty');
  assert.equal(body.data, undefined, 'Envelope field "data" must not exist on error');
}

// ---------------------------------------------------------------------------
// Test Suite Execution
// ---------------------------------------------------------------------------

describe('API Exception-Envelope & HTTP Contract Integration Suite (Phase 6.6-F)', () => {
  let app;
  let baseUrl;
  let tokenService;
  let validStudentToken;
  let recruiterToken;
  let bannedStudentToken;

  before(async () => {
    app = await NestFactory.create(HttpContractTestModule, {
      bodyParser: false,
      logger: false,
    });

    const expressApp = app.getHttpAdapter().getInstance();
    if (typeof expressApp?.disable === 'function') {
      expressApp.disable('x-powered-by');
    }
    expressApp.use(express.json({ limit: '1mb' }));
    expressApp.use(cookieParser());

    // Security middlewares
    const secMiddleware = new SecurityHeadersMiddleware(testConfig);
    const csrfMiddleware = new CsrfMiddleware(testConfig);
    expressApp.use((req, res, next) => secMiddleware.use(req, res, next));
    expressApp.use((req, res, next) => csrfMiddleware.use(req, res, next));

    // Global prefix and filter adhering to main.ts
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter(testConfig));

    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    tokenService = app.get(TokenService);

    // Pre-generate valid JWTs
    validStudentToken = await tokenService.signToken({
      id: 'student-valid-uuid',
      email: 'student@example.com',
      role: 'STUDENT',
    });

    recruiterToken = await tokenService.signToken({
      id: 'recruiter-valid-uuid',
      email: 'recruiter@company.com',
      role: 'RECRUITER',
    });

    bannedStudentToken = await tokenService.signToken({
      id: 'banned-student-id',
      email: 'banned@example.com',
      role: 'STUDENT',
    });
  });

  after(async () => {
    if (app) {
      await app.close();
    }
  });

  // =========================================================================
  // 1. Success Envelope Tests (HTTP 2xx)
  // =========================================================================
  describe('1. Success Envelope Contract (docs/API.md)', () => {
    it('1.1 should return 200 with standard success envelope for public login', async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'student@example.com',
          password: 'Password123!',
        }),
      });

      const body = await res.json();
      assertSuccessEnvelope(body, 200, res.status);
      assert.equal(body.data.email, 'student@example.com');
      assert.equal(body.data.role, 'STUDENT');
      assert.equal(body.data.user_id, 'user-uuid-logged-in');

      // Verify token is NOT exposed in response body per API.md §1.2
      assert.equal(body.data.token, undefined);

      // Verify HttpOnly cookie is attached
      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie, 'Expected Set-Cookie header');
      assert.ok(setCookie.includes('cf_auth='), 'Cookie name must be cf_auth');
      assert.ok(setCookie.toLowerCase().includes('httponly'), 'Cookie must be HttpOnly');
    });

    it('1.2 should return 200 with standard success envelope for authenticated endpoint via Bearer header', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validStudentToken}`,
        },
      });

      const body = await res.json();
      assertSuccessEnvelope(body, 200, res.status);
      assert.equal(body.data.id, 'student-profile-uuid');
      assert.equal(body.data.first_name, 'Jane');
      assert.equal(body.data.last_name, 'Doe');
      assert.ok(Array.isArray(body.data.skills), 'Skills must be an array');
    });

    it('1.3 should return 200 with standard success envelope for authenticated endpoint via HttpOnly cookie', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Cookie: `cf_auth=${validStudentToken}`,
        },
      });

      const body = await res.json();
      assertSuccessEnvelope(body, 200, res.status);
      assert.equal(body.data.first_name, 'Jane');
      assert.equal(body.data.last_name, 'Doe');
    });

    it('1.4 should attach defensive security headers to success responses', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validStudentToken}`,
        },
      });

      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-xss-protection'), '0');
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.ok(res.headers.get('permissions-policy'));
      assert.ok(res.headers.get('content-security-policy'));
      assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By must be disabled');
    });
  });

  // =========================================================================
  // 2. HTTP 400 Validation Error Contract
  // =========================================================================
  describe('2. HTTP 400 Validation Error Contract', () => {
    it('2.1 should return 400 VALIDATION_ERROR with structured details when body fails Zod schema', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'short',
          role: 'INVALID_ROLE',
        }),
      });

      const body = await res.json();
      assertErrorEnvelope(body, 400, res.status, 'VALIDATION_ERROR');

      // Verify details array structure
      assert.ok(Array.isArray(body.error.details), 'Validation details must be an array');
      assert.ok(body.error.details.length >= 2, 'Expected multiple validation issue entries');
      for (const item of body.error.details) {
        assert.equal(typeof item.field, 'string', 'Validation detail field must be a string');
        assert.equal(typeof item.issue, 'string', 'Validation detail issue must be a string');
      }

      // Verify zero stack trace or internal exception leakage
      assert.equal(body.error.stack, undefined);
      assert.equal(body.error.trace, undefined);
      assert.equal(body.stack, undefined);
    });

    it('2.2 should return 400 VALIDATION_ERROR when request body contains malformed JSON', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email": "broken-json, missing closing brace',
      });

      const body = await res.json();
      assertErrorEnvelope(body, 400, res.status, 'VALIDATION_ERROR');
      assert.equal(body.error.stack, undefined);
    });

    it('2.3 should attach defensive security headers to 400 error responses', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    });
  });

  // =========================================================================
  // 3. HTTP 401 Unauthorized Contract
  // =========================================================================
  describe('3. HTTP 401 Unauthorized Contract', () => {
    it('3.1 should return 401 UNAUTHORIZED when calling protected endpoint without token', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
      });

      const body = await res.json();
      assertErrorEnvelope(body, 401, res.status, 'UNAUTHORIZED');
      assert.equal(body.error.message, 'Missing authorization token');
      assert.equal(body.error.stack, undefined);
      assert.equal(body.data, undefined);
    });

    it('3.2 should return 401 UNAUTHORIZED when token is malformed or invalid', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid.tampered.token',
        },
      });

      const body = await res.json();
      assertErrorEnvelope(body, 401, res.status, 'UNAUTHORIZED');
      assert.equal(body.error.message, 'Invalid or expired token');
      assert.equal(body.error.stack, undefined);
    });
  });

  // =========================================================================
  // 4. HTTP 403 Forbidden Contract (RBAC, Banned User & CSRF)
  // =========================================================================
  describe('4. HTTP 403 Forbidden Contract', () => {
    it('4.1 should return 403 FORBIDDEN when user has insufficient role (RECRUITER accessing STUDENT route)', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${recruiterToken}`,
        },
      });

      const body = await res.json();
      assertErrorEnvelope(body, 403, res.status, 'FORBIDDEN');
      assert.equal(
        body.error.message,
        'Insufficient role permissions for this resource'
      );
      assert.equal(body.data, undefined);
      assert.equal(body.error.stack, undefined);
    });

    it('4.2 should return 403 FORBIDDEN when user account has been suspended/banned', async () => {
      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${bannedStudentToken}`,
        },
      });

      const body = await res.json();
      assertErrorEnvelope(body, 403, res.status, 'FORBIDDEN');
      assert.equal(
        body.error.message,
        'Your account has been suspended. Contact support.'
      );
      assert.equal(body.data, undefined);
    });

    it('4.3 should return 403 FORBIDDEN when state-changing request has untrusted Origin header (CSRF)', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://malicious-attacker-site.com',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Password123!',
          role: 'STUDENT',
        }),
      });

      const body = await res.json();
      assertErrorEnvelope(body, 403, res.status, 'FORBIDDEN');
      assert.equal(body.error.message, 'Cross-origin request rejected');
    });
  });

  // =========================================================================
  // 5. HTTP 404 Not Found Contract
  // =========================================================================
  describe('5. HTTP 404 Not Found Contract', () => {
    it('5.1 should return 404 NOT_FOUND for unmapped routes', async () => {
      const res = await fetch(`${baseUrl}/completely-non-existent-route-xyz`, {
        method: 'GET',
      });

      const body = await res.json();
      assertErrorEnvelope(body, 404, res.status, 'NOT_FOUND');
      assert.ok(body.error.message.includes('/completely-non-existent-route-xyz'));
      assert.equal(body.data, undefined);
      assert.equal(body.error.stack, undefined);
    });

    it('5.2 should return 404 NOT_FOUND when domain resource is not found', async () => {
      const missingUserToken = await tokenService.signToken({
        id: 'missing-student-id',
        email: 'missing@example.com',
        role: 'STUDENT',
      });

      const res = await fetch(`${baseUrl}/students/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${missingUserToken}`,
        },
      });

      const body = await res.json();
      assertErrorEnvelope(body, 404, res.status, 'NOT_FOUND');
      assert.equal(body.error.message, 'Student profile not found');
      assert.equal(body.data, undefined);
    });
  });

  // =========================================================================
  // 6. HTTP 409 Conflict Contract
  // =========================================================================
  describe('6. HTTP 409 Conflict Contract', () => {
    it('6.1 should return 409 CONFLICT when resource state already exists (duplicate email)', async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'duplicate@example.com',
          password: 'Password123!',
          role: 'STUDENT',
        }),
      });

      const body = await res.json();
      assertErrorEnvelope(body, 409, res.status, 'CONFLICT');
      assert.equal(body.error.message, 'Email is already registered');
      assert.equal(body.data, undefined);
      assert.equal(body.error.stack, undefined);

      // Verify no raw DB constraint names or Prisma codes leak
      const rawText = JSON.stringify(body);
      assert.equal(rawText.includes('P2002'), false);
      assert.equal(rawText.includes('users_email_key'), false);
    });
  });

  // =========================================================================
  // 7. HTTP 422 Unprocessable Entity Contract
  // =========================================================================
  describe('7. HTTP 422 Unprocessable Entity Contract', () => {
    /**
     * Note: In production, HTTP 422 is mapped in AllExceptionsFilter and thrown by
     * PdfParserService ('EMPTY_PDF_CONTENT', 'INVALID_PDF_FORMAT'). Production HTTP
     * endpoints delegate extraction to the background worker (ResumeExtractionWorker).
     * The tests below verify the HTTP layer's contract handling of 422 exceptions.
     */
    it('7.1 should return 422 with domain error code when UnprocessableEntityException provides custom code', async () => {
      const res = await fetch(`${baseUrl}/contract-probe/error-422-pdf`);

      const body = await res.json();
      assertErrorEnvelope(body, 422, res.status, 'EMPTY_PDF_CONTENT');
      assert.equal(
        body.error.message,
        'The PDF document contains no readable text (it may be image-only or scanned).'
      );
      assert.equal(body.data, undefined);
      assert.equal(body.error.stack, undefined);
    });

    it('7.2 should return 422 UNPROCESSABLE_ENTITY default code for generic UnprocessableEntityException', async () => {
      const res = await fetch(`${baseUrl}/contract-probe/error-422-generic`);

      const body = await res.json();
      assertErrorEnvelope(body, 422, res.status, 'UNPROCESSABLE_ENTITY');
      assert.equal(body.error.message, 'Unable to process semantic payload');
      assert.equal(body.data, undefined);
    });
  });

  // =========================================================================
  // 8. HTTP 429 Rate Limit Contract
  // =========================================================================
  describe('8. HTTP 429 Rate Limit Contract', () => {
    it('8.1 should return 429 RATE_LIMITED and Retry-After header when rate limit is exceeded', async () => {
      // First 2 requests should pass (limit: 2)
      const res1 = await fetch(`${baseUrl}/contract-probe/rate-limited`);
      assert.equal(res1.status, 200);

      const res2 = await fetch(`${baseUrl}/contract-probe/rate-limited`);
      assert.equal(res2.status, 200);

      // 3rd request must be blocked with HTTP 429
      const res3 = await fetch(`${baseUrl}/contract-probe/rate-limited`);
      const body = await res3.json();

      assertErrorEnvelope(body, 429, res3.status, 'RATE_LIMITED');
      assert.equal(
        body.error.message,
        'Too many requests. Please try again later.'
      );

      // Verify standard rate-limit headers
      const retryAfter = res3.headers.get('retry-after');
      assert.ok(retryAfter, 'Expected Retry-After header');
      assert.ok(Number(retryAfter) >= 0, 'Retry-After must be a non-negative number');
      assert.equal(res3.headers.get('x-ratelimit-limit'), '2');
      assert.equal(res3.headers.get('x-ratelimit-remaining'), '0');
      assert.ok(res3.headers.get('x-ratelimit-reset'), 'Expected X-RateLimit-Reset header');

      // Verify no internal store keys or redis/sql details leak
      const rawText = JSON.stringify(body);
      assert.equal(rawText.includes('probe-rate'), false);
      assert.equal(rawText.includes('InMemoryRateLimitStore'), false);
    });
  });

  // =========================================================================
  // 9. HTTP 413 Payload Too Large Contract
  // =========================================================================
  describe('9. HTTP 413 Payload Too Large Contract', () => {
    it('9.1 should return 413 VALIDATION_ERROR adhering to docs/API.md', async () => {
      const res = await fetch(`${baseUrl}/contract-probe/error-413-payload`);

      const body = await res.json();
      assertErrorEnvelope(body, 413, res.status, 'VALIDATION_ERROR');
      assert.equal(body.error.message, 'Request payload exceeds size limit');
      assert.equal(body.data, undefined);
    });
  });

  // =========================================================================
  // 10. HTTP 500 Error Sanitization & Security Leakage Prevention
  // =========================================================================
  describe('10. HTTP 500 Sanitization & Information Leakage Defense', () => {
    it('10.1 should mask unhandled database error with generic message and zero credential leakage', async () => {
      const res = await fetch(`${baseUrl}/contract-probe/error-500-db`);

      const body = await res.json();
      assertErrorEnvelope(body, 500, res.status, 'INTERNAL_ERROR');

      // Generic masked message in production
      assert.equal(
        body.error.message,
        'An unexpected internal server error occurred.'
      );

      const rawBody = JSON.stringify(body);
      // Ensure zero leakage of sensitive database strings
      assert.equal(rawBody.includes('careerforge_admin'), false, 'Database user leaked');
      assert.equal(rawBody.includes('P@ssw0rd123!'), false, 'Database password leaked');
      assert.equal(rawBody.includes('postgresql://'), false, 'Database URL scheme leaked');
      assert.equal(rawBody.includes('db-cluster.internal'), false, 'Internal host leaked');
      assert.equal(rawBody.includes('careerforge_prod'), false, 'Database name leaked');
      assert.equal(rawBody.includes('FATAL'), false, 'PostgreSQL internal keyword leaked');
      assert.equal(rawBody.includes('stack'), false, 'Stack property leaked');
    });

    it('10.2 should mask internal filesystem paths and omit stack traces', async () => {
      const res = await fetch(`${baseUrl}/contract-probe/error-500-fs`);

      const body = await res.json();
      assertErrorEnvelope(body, 500, res.status, 'INTERNAL_ERROR');
      assert.equal(
        body.error.message,
        'An unexpected internal server error occurred.'
      );

      const rawBody = JSON.stringify(body);
      assert.equal(rawBody.includes('C:\\Users'), false, 'Filesystem path leaked');
      assert.equal(rawBody.includes('master-key.pem'), false, 'Secret file leaked');
      assert.equal(rawBody.includes('ENOENT'), false, 'OS error code leaked');
      assert.equal(rawBody.includes('at '), false, 'Stack trace line leaked');
    });

    it('10.3 should mask Prisma queries and SQL statements', async () => {
      const res = await fetch(`${baseUrl}/contract-probe/error-500-prisma`);

      const body = await res.json();
      assertErrorEnvelope(body, 500, res.status, 'INTERNAL_ERROR');
      assert.equal(
        body.error.message,
        'An unexpected internal server error occurred.'
      );

      const rawBody = JSON.stringify(body);
      assert.equal(rawBody.includes('PrismaClientKnownRequestError'), false);
      assert.equal(rawBody.includes('SELECT * FROM'), false);
      assert.equal(rawBody.includes('password_hash'), false);
    });

    it('10.4 should never echo back sensitive request headers or bearer tokens', async () => {
      const sensitiveToken = 'sensitive-auth-token-should-never-echo-back-12345';
      const sensitiveCookie = 'cf_auth=super-secret-session-cookie-data-998877';

      const res = await fetch(`${baseUrl}/contract-probe/error-500-db`, {
        headers: {
          Authorization: `Bearer ${sensitiveToken}`,
          Cookie: sensitiveCookie,
          'X-Custom-Secret': 'confidential-custom-header-value',
        },
      });

      const body = await res.json();
      const rawBody = JSON.stringify(body);

      assert.equal(rawBody.includes(sensitiveToken), false);
      assert.equal(rawBody.includes(sensitiveCookie), false);
      assert.equal(rawBody.includes('confidential-custom-header-value'), false);
    });
  });

  // =========================================================================
  // 11. Envelope Shape Consistency Invariants
  // =========================================================================
  describe('11. Envelope Shape Consistency Across API Contract', () => {
    it('11.1 should enforce success envelope invariant { success: true, data: ... }', async () => {
      const endpoints = [
        { url: `${baseUrl}/students/me`, headers: { Authorization: `Bearer ${validStudentToken}` } },
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep.url, { headers: ep.headers });
        const body = await res.json();

        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(typeof body.data, 'object');
        assert.equal(body.error, undefined);
      }
    });

    it('11.2 should enforce error envelope invariant { success: false, error: { code, message } } across all 4xx/5xx', async () => {
      const errorCalls = [
        { url: `${baseUrl}/auth/register`, method: 'POST', body: '{}', expectedStatus: 400 },
        { url: `${baseUrl}/students/me`, method: 'GET', expectedStatus: 401 },
        { url: `${baseUrl}/students/me`, method: 'GET', headers: { Authorization: `Bearer ${recruiterToken}` }, expectedStatus: 403 },
        { url: `${baseUrl}/non-existent`, method: 'GET', expectedStatus: 404 },
        { url: `${baseUrl}/auth/register`, method: 'POST', body: JSON.stringify({ email: 'duplicate@example.com', password: 'Password123!', role: 'STUDENT' }), expectedStatus: 409 },
        { url: `${baseUrl}/contract-probe/error-422-pdf`, method: 'GET', expectedStatus: 422 },
        { url: `${baseUrl}/contract-probe/error-413-payload`, method: 'GET', expectedStatus: 413 },
        { url: `${baseUrl}/contract-probe/error-500-db`, method: 'GET', expectedStatus: 500 },
      ];

      for (const call of errorCalls) {
        const res = await fetch(call.url, {
          method: call.method,
          headers: {
            'Content-Type': 'application/json',
            ...(call.headers || {}),
          },
          body: call.body,
        });

        const body = await res.json();
        assert.equal(res.status, call.expectedStatus, `URL ${call.url} expected status ${call.expectedStatus}`);
        assert.equal(body.success, false, `URL ${call.url} success must be false`);
        assert.equal(typeof body.error, 'object', `URL ${call.url} error must be an object`);
        assert.equal(typeof body.error.code, 'string', `URL ${call.url} error.code must be a string`);
        assert.equal(typeof body.error.message, 'string', `URL ${call.url} error.message must be a string`);
        assert.equal(body.data, undefined, `URL ${call.url} data must be undefined on error`);
      }
    });
  });
});
