const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { Reflector } = require('@nestjs/core');
const { UserRole } = require('@prisma/client');
const { registerSchema, adminBootstrapSchema } = require('@careerforge/validation');

// Import compiled dist modules
const { AdminBootstrapService } = require('../dist/modules/admin/admin-bootstrap.service');
const { PasswordService } = require('../dist/modules/auth/password.service');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { TokenService } = require('../dist/modules/auth/token.service');
const { RolesGuard } = require('../dist/core/guards/roles.guard');
const { AdminUserController } = require('../dist/modules/admin/admin-user.controller');
const { AdminMetricsController } = require('../dist/modules/admin/admin-metrics.controller');
const { parseCliArgs } = require('../dist/scripts/bootstrap-admin');

describe('Phase 6.4-D: Safe First-Admin Provisioning Suite', () => {
  let passwordService;
  let mockPrisma;
  let bootstrapService;

  beforeEach(() => {
    passwordService = new PasswordService();

    mockPrisma = {
      user: {
        findUnique: async () => null,
        create: async (args) => ({
          id: 'admin-uuid-1111-2222-3333',
          email: args.data.email,
          role: args.data.role,
        }),
      },
    };

    bootstrapService = new AdminBootstrapService(mockPrisma, passwordService);
  });

  // =========================================================================
  // 1. Validation Schema Contracts
  // =========================================================================
  describe('1. Validation Schema (adminBootstrapSchema)', () => {
    it('should validate a valid admin email and strong password', () => {
      const valid = adminBootstrapSchema.safeParse({
        email: 'Admin@CareerForge.dev  ',
        password: 'AdminPassword123!',
      });
      assert.equal(valid.success, true);
      assert.equal(valid.data.email, 'admin@careerforge.dev'); // normalized lowercase & trimmed
    });

    it('should reject invalid email formats', () => {
      const result = adminBootstrapSchema.safeParse({
        email: 'invalid-email-string',
        password: 'AdminPassword123!',
      });
      assert.equal(result.success, false);
      assert.equal(result.error.issues[0].path[0], 'email');
    });

    it('should reject passwords shorter than 8 characters', () => {
      const result = adminBootstrapSchema.safeParse({
        email: 'admin@careerforge.dev',
        password: 'P@1',
      });
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((i) => i.message.includes('at least 8 characters')));
    });

    it('should reject passwords lacking a numeric digit', () => {
      const result = adminBootstrapSchema.safeParse({
        email: 'admin@careerforge.dev',
        password: 'NoNumbersHere!@#',
      });
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((i) => i.message.includes('at least 1 number')));
    });

    it('should reject passwords lacking a special character', () => {
      const result = adminBootstrapSchema.safeParse({
        email: 'admin@careerforge.dev',
        password: 'NoSpecialChars123',
      });
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((i) => i.message.includes('at least 1 special character')));
    });

    it('should reject passwords exceeding 72 characters (bcrypt limit)', () => {
      const result = adminBootstrapSchema.safeParse({
        email: 'admin@careerforge.dev',
        password: 'A1!'.repeat(25), // 75 chars
      });
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((i) => i.message.includes('exceed 72 characters')));
    });
  });

  // =========================================================================
  // 2. AdminBootstrapService Creation & Idempotency
  // =========================================================================
  describe('2. AdminBootstrapService Core Mechanics', () => {
    it('should create initial admin user with hashed password and ADMIN role', async () => {
      let createdPayload = null;
      mockPrisma.user.create = async (args) => {
        createdPayload = args.data;
        return {
          id: 'admin-uuid-1',
          email: args.data.email,
          role: args.data.role,
        };
      };

      const result = await bootstrapService.bootstrapAdmin({
        email: 'admin@careerforge.dev',
        password: 'SecureP@ssw0rd1',
      });

      assert.equal(result.status, 'CREATED');
      assert.equal(result.user.email, 'admin@careerforge.dev');
      assert.equal(result.user.role, UserRole.ADMIN);

      // Verify payload was passed to DB correctly
      assert.equal(createdPayload.email, 'admin@careerforge.dev');
      assert.equal(createdPayload.role, UserRole.ADMIN);

      // Verify password was hashed (bcrypt hash pattern)
      assert.ok(createdPayload.password_hash.startsWith('$2'));
      assert.notEqual(createdPayload.password_hash, 'SecureP@ssw0rd1');

      // Verify bcrypt match
      const matches = await bcrypt.compare('SecureP@ssw0rd1', createdPayload.password_hash);
      assert.equal(matches, true);
    });

    it('should be idempotent: report EXISTS without recreating if admin user already exists', async () => {
      let createCalled = false;
      mockPrisma.user.findUnique = async () => ({
        id: 'existing-admin-id',
        email: 'admin@careerforge.dev',
        role: UserRole.ADMIN,
      });
      mockPrisma.user.create = async () => {
        createCalled = true;
      };

      const result = await bootstrapService.bootstrapAdmin({
        email: 'admin@careerforge.dev',
        password: 'SecureP@ssw0rd1',
      });

      assert.equal(result.status, 'EXISTS');
      assert.equal(result.user.id, 'existing-admin-id');
      assert.equal(result.user.email, 'admin@careerforge.dev');
      assert.equal(result.user.role, UserRole.ADMIN);
      assert.equal(createCalled, false, 'Should not recreate or modify existing admin');
    });

    it('should refuse to elevate existing STUDENT to ADMIN', async () => {
      mockPrisma.user.findUnique = async () => ({
        id: 'student-id-123',
        email: 'student@careerforge.dev',
        role: UserRole.STUDENT,
      });

      await assert.rejects(
        () =>
          bootstrapService.bootstrapAdmin({
            email: 'student@careerforge.dev',
            password: 'SecureP@ssw0rd1',
          }),
        (err) => {
          assert.equal(err.status, 409);
          assert.ok(err.message.includes("already exists with role 'STUDENT'"));
          assert.ok(err.message.includes('Automatic elevation to ADMIN is prohibited'));
          return true;
        }
      );
    });

    it('should refuse to elevate existing RECRUITER to ADMIN', async () => {
      mockPrisma.user.findUnique = async () => ({
        id: 'recruiter-id-123',
        email: 'recruiter@careerforge.dev',
        role: UserRole.RECRUITER,
      });

      await assert.rejects(
        () =>
          bootstrapService.bootstrapAdmin({
            email: 'recruiter@careerforge.dev',
            password: 'SecureP@ssw0rd1',
          }),
        (err) => {
          assert.equal(err.status, 409);
          assert.ok(err.message.includes("already exists with role 'RECRUITER'"));
          assert.ok(err.message.includes('Automatic elevation to ADMIN is prohibited'));
          return true;
        }
      );
    });

    it('should reject invalid input payload with 400 VALIDATION_ERROR', async () => {
      await assert.rejects(
        () =>
          bootstrapService.bootstrapAdmin({
            email: 'not-an-email',
            password: 'weak',
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          return true;
        }
      );
    });

    it('should never expose plaintext password in result payload or thrown errors', async () => {
      const secretPassword = 'UltraSecretPassword99!';
      const result = await bootstrapService.bootstrapAdmin({
        email: 'admin@careerforge.dev',
        password: secretPassword,
      });

      const serialized = JSON.stringify(result);
      assert.equal(serialized.includes(secretPassword), false);
    });
  });

  // =========================================================================
  // 3. Security Invariants: Public Registration Remains Protected
  // =========================================================================
  describe('3. Security Invariants & Public Registration Defense', () => {
    it('public registerSchema enum strictly disallows ADMIN', () => {
      const result = registerSchema.safeParse({
        email: 'hacker@careerforge.dev',
        password: 'Password123!',
        role: 'ADMIN',
      });
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some((i) => i.message.includes("Role must be exactly 'STUDENT' or 'RECRUITER'")));
    });

    it('AuthService.register defensively blocks any ADMIN registration attempt', async () => {
      const mockTokenService = new TokenService({ sign: () => 'token' });
      const authService = new AuthService(mockPrisma, passwordService, mockTokenService);

      await assert.rejects(
        () =>
          authService.register({
            email: 'hacker@careerforge.dev',
            password: 'Password123!',
            role: 'ADMIN',
          }),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.response.message, 'Registration as ADMIN is not permitted');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // 4. End-to-End Authentication & Authorization for Bootstrapped Admin
  // =========================================================================
  describe('4. Login & Authorization for Bootstrapped Admin', () => {
    it('bootstrapped admin can log in via standard AuthService.login and receives valid token', async () => {
      const password = 'AdminPassword123!';
      const passwordHash = await passwordService.hash(password);

      mockPrisma.user.findUnique = async () => ({
        id: 'admin-uuid-1',
        email: 'admin@careerforge.dev',
        password_hash: passwordHash,
        role: UserRole.ADMIN,
        is_banned: false,
      });

      let signedPayload = null;
      const mockTokenService = {
        signToken: async (user) => {
          signedPayload = { sub: user.id, email: user.email, role: user.role };
          return 'jwt-token-for-admin';
        },
      };

      const authService = new AuthService(mockPrisma, passwordService, mockTokenService);

      const loginResult = await authService.login({
        email: 'admin@careerforge.dev',
        password,
      });

      assert.equal(loginResult.email, 'admin@careerforge.dev');
      assert.equal(loginResult.role, UserRole.ADMIN);
      assert.equal(loginResult.token, 'jwt-token-for-admin');
      assert.equal(signedPayload.role, 'ADMIN');
    });

    it('RolesGuard permits bootstrapped admin to access AdminUserController and AdminMetricsController', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const createMockContext = (controller, user) => ({
        switchToHttp: () => ({
          getRequest: () => (user ? { user } : {}),
        }),
        getHandler: () => () => {},
        getClass: () => controller,
      });

      // Admin user context
      const adminCtx = { userId: 'admin-1', role: 'ADMIN' };
      assert.equal(guard.canActivate(createMockContext(AdminUserController, adminCtx)), true);
      assert.equal(guard.canActivate(createMockContext(AdminMetricsController, adminCtx)), true);

      // Student user context -> rejected 403
      const studentCtx = { userId: 'student-1', role: 'STUDENT' };
      assert.throws(
        () => guard.canActivate(createMockContext(AdminUserController, studentCtx)),
        (err) => err.status === 403
      );

      // Recruiter user context -> rejected 403
      const recruiterCtx = { userId: 'recruiter-1', role: 'RECRUITER' };
      assert.throws(
        () => guard.canActivate(createMockContext(AdminUserController, recruiterCtx)),
        (err) => err.status === 403
      );
    });
  });

  // =========================================================================
  // 5. CLI Security & Command-Line Credential Protection
  // =========================================================================
  describe('5. CLI Security: Command-Line Flag Protection', () => {
    it('strictly rejects --password flag with security warning', () => {
      assert.throws(
        () => parseCliArgs(['--email', 'admin@careerforge.dev', '--password', 'MySecret123!']),
        (err) => {
          assert.ok(err.message.includes('Passing passwords via command-line flags (--password) is prohibited'));
          assert.ok(err.message.includes('shell history and process tables'));
          return true;
        }
      );
    });

    it('strictly rejects --password=value syntax with security warning', () => {
      assert.throws(
        () => parseCliArgs(['--password=MySecret123!']),
        (err) => {
          assert.ok(err.message.includes('Passing passwords via command-line flags (--password) is prohibited'));
          return true;
        }
      );
    });

    it('strictly rejects shorthand -p flag with security warning', () => {
      assert.throws(
        () => parseCliArgs(['-p', 'MySecret123!']),
        (err) => {
          assert.ok(err.message.includes('Passing passwords via command-line flags (--password) is prohibited'));
          return true;
        }
      );
    });

    it('safely parses --email arguments without allowing password flags', () => {
      const parsed = parseCliArgs(['--email', 'admin@careerforge.dev']);
      assert.equal(parsed.email, 'admin@careerforge.dev');
      assert.equal(parsed.password, undefined);
    });

    it('safely parses --email=value syntax', () => {
      const parsed = parseCliArgs(['--email=ops@careerforge.dev']);
      assert.equal(parsed.email, 'ops@careerforge.dev');
      assert.equal(parsed.password, undefined);
    });
  });
});
