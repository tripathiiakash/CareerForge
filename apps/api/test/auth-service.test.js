const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} = require('@nestjs/common');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { QUEUE_NAMES } = require('../dist/core/queue/queue.types');

describe('AuthService Core Regression Test Suite (Phase 6.6-B)', () => {
  let authService;
  let mockPrisma;
  let mockPasswordService;
  let mockTokenService;
  let mockQueueService;

  // Spy tracking variables
  let dummyCompareCallCount;
  let dummyCompareLastArg;
  let compareCallCount;
  let compareLastArgs;
  let hashCallCount;
  let signTokenCallCount;
  let enqueuedJobs;

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const samplePasswordHash = '$2b$10$abcdefghijklmnopqrstuv';

  beforeEach(() => {
    dummyCompareCallCount = 0;
    dummyCompareLastArg = null;
    compareCallCount = 0;
    compareLastArgs = null;
    hashCallCount = 0;
    signTokenCallCount = 0;
    enqueuedJobs = [];

    mockPrisma = {
      user: {
        findUnique: async () => null,
        create: async ({ data }) => ({
          id: validUserId,
          email: data.email,
          password_hash: data.password_hash,
          role: data.role,
          is_banned: false,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      },
      student: {
        create: async ({ data }) => ({
          id: 'student-profile-uuid',
          user_id: data.user_id,
          first_name: data.first_name,
          last_name: data.last_name,
        }),
      },
      recruiter: {
        create: async ({ data }) => ({
          id: 'recruiter-profile-uuid',
          first_name: data.first_name,
          last_name: data.last_name,
          is_approved: false,
        }),
      },
      $transaction: async (callback) => {
        const tx = {
          user: mockPrisma.user,
          student: mockPrisma.student,
          recruiter: mockPrisma.recruiter,
        };
        return callback(tx);
      },
    };

    mockPasswordService = {
      hash: async (plain) => {
        hashCallCount++;
        return `hashed_${plain}`;
      },
      compare: async (plain, hash) => {
        compareCallCount++;
        compareLastArgs = { plain, hash };
        return plain === 'CorrectPassword123!' && hash === samplePasswordHash;
      },
      dummyCompare: async (plain) => {
        dummyCompareCallCount++;
        dummyCompareLastArg = plain;
        return false;
      },
    };

    mockTokenService = {
      signToken: async (user) => {
        signTokenCallCount++;
        return `mock.jwt.token.${user.id}.${user.role.toLowerCase()}`;
      },
    };

    mockQueueService = {
      send: async (queueName, data, options) => {
        enqueuedJobs.push({ queueName, data, options });
        return 'job-uuid-mock';
      },
    };

    authService = new AuthService(
      mockPrisma,
      mockPasswordService,
      mockTokenService,
      mockQueueService
    );
  });

  // ===========================================================================
  // 1. LOGIN TESTS
  // ===========================================================================
  describe('1. Login Scenarios', () => {
    it('1.1. Successful login: returns authenticated user data and signed token without leaking password hash', async () => {
      mockPrisma.user.findUnique = async ({ where }) => {
        if (where.email === 'student@example.com') {
          return {
            id: validUserId,
            email: 'student@example.com',
            password_hash: samplePasswordHash,
            role: 'STUDENT',
            is_banned: false,
          };
        }
        return null;
      };

      const result = await authService.login({
        email: 'student@example.com',
        password: 'CorrectPassword123!',
      });

      assert.equal(result.user_id, validUserId);
      assert.equal(result.email, 'student@example.com');
      assert.equal(result.role, 'STUDENT');
      assert.equal(result.token, `mock.jwt.token.${validUserId}.student`);

      // Verify compare was invoked with correct arguments
      assert.equal(compareCallCount, 1);
      assert.deepEqual(compareLastArgs, {
        plain: 'CorrectPassword123!',
        hash: samplePasswordHash,
      });

      // Verify dummyCompare was NOT invoked on successful user resolution
      assert.equal(dummyCompareCallCount, 0);

      // Verify secrets safety: password_hash must never be present in returned object
      assert.equal('password_hash' in result, false);
      assert.equal('password' in result, false);
      assert.deepEqual(Object.keys(result).sort(), [
        'email',
        'role',
        'token',
        'user_id',
      ]);
    });

    it('1.2. Successful login with whitespace and mixed-case email: normalizes email before lookup', async () => {
      let queriedEmail = null;
      mockPrisma.user.findUnique = async ({ where }) => {
        queriedEmail = where.email;
        if (where.email === 'case.student@example.com') {
          return {
            id: validUserId,
            email: 'case.student@example.com',
            password_hash: samplePasswordHash,
            role: 'STUDENT',
            is_banned: false,
          };
        }
        return null;
      };

      const result = await authService.login({
        email: '  Case.STUDENT@Example.COM  ',
        password: 'CorrectPassword123!',
      });

      assert.equal(queriedEmail, 'case.student@example.com');
      assert.equal(result.email, 'case.student@example.com');
      assert.equal(result.user_id, validUserId);
    });

    it('1.3. Non-existent user: invokes dummyCompare to prevent timing attacks and throws safe 401 UnauthorizedException', async () => {
      mockPrisma.user.findUnique = async () => null;

      await assert.rejects(
        () =>
          authService.login({
            email: 'nonexistent@example.com',
            password: 'SomePassword123!',
          }),
        (err) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.equal(err.status, 401);
          assert.equal(err.response.code, 'UNAUTHORIZED');
          assert.equal(err.response.message, 'Invalid credentials');
          return true;
        }
      );

      // Verify dummyCompare was invoked with the supplied password
      assert.equal(
        dummyCompareCallCount,
        1,
        'dummyCompare must be called exactly once for absent user'
      );
      assert.equal(dummyCompareLastArg, 'SomePassword123!');

      // Real compare and token signing must NOT occur
      assert.equal(compareCallCount, 0);
      assert.equal(signTokenCallCount, 0);
    });

    it('1.4. Existing user with incorrect password: fails password comparison and throws 401 UnauthorizedException', async () => {
      mockPrisma.user.findUnique = async () => ({
        id: validUserId,
        email: 'valid@example.com',
        password_hash: samplePasswordHash,
        role: 'STUDENT',
        is_banned: false,
      });

      await assert.rejects(
        () =>
          authService.login({
            email: 'valid@example.com',
            password: 'WrongPassword999!',
          }),
        (err) => {
          assert.ok(err instanceof UnauthorizedException);
          assert.equal(err.status, 401);
          assert.equal(err.response.code, 'UNAUTHORIZED');
          assert.equal(err.response.message, 'Invalid credentials');
          return true;
        }
      );

      // Verify compare was attempted with password_hash
      assert.equal(compareCallCount, 1);
      assert.deepEqual(compareLastArgs, {
        plain: 'WrongPassword999!',
        hash: samplePasswordHash,
      });

      // dummyCompare should not be called since user exists
      assert.equal(dummyCompareCallCount, 0);

      // Token signing must NOT occur
      assert.equal(signTokenCallCount, 0);
    });

    it('1.5. Banned user: throws 403 ForbiddenException and halts before password comparison', async () => {
      mockPrisma.user.findUnique = async () => ({
        id: validUserId,
        email: 'banned@example.com',
        password_hash: samplePasswordHash,
        role: 'STUDENT',
        is_banned: true, // User account is suspended
      });

      await assert.rejects(
        () =>
          authService.login({
            email: 'banned@example.com',
            password: 'CorrectPassword123!',
          }),
        (err) => {
          assert.ok(err instanceof ForbiddenException);
          assert.equal(err.status, 403);
          assert.equal(err.response.code, 'FORBIDDEN');
          assert.equal(
            err.response.message,
            'Your account has been suspended. Contact support.'
          );
          return true;
        }
      );

      // Authentication check order: suspension check precedes password compare
      assert.equal(
        compareCallCount,
        0,
        'Password comparison must not run for a banned account'
      );
      assert.equal(dummyCompareCallCount, 0);
      assert.equal(signTokenCallCount, 0);
    });
  });

  // ===========================================================================
  // 2. REGISTRATION TESTS
  // ===========================================================================
  describe('2. Registration Scenarios', () => {
    it('2.1. Successful student registration: hashes password, runs atomic transaction, creates profile, and enqueues welcome email', async () => {
      let createdUserData = null;
      let createdStudentData = null;

      mockPrisma.user.create = async ({ data }) => {
        createdUserData = data;
        return {
          id: validUserId,
          email: data.email,
          password_hash: data.password_hash,
          role: data.role,
        };
      };

      mockPrisma.student.create = async ({ data }) => {
        createdStudentData = data;
        return {
          id: 'student-profile-1',
          user_id: data.user_id,
          first_name: data.first_name,
          last_name: data.last_name,
        };
      };

      const result = await authService.register({
        email: '  NewStudent@University.EDU  ',
        password: 'SecurePassword123!',
        role: 'STUDENT',
      });

      // 1. Return payload assertions
      assert.equal(result.user_id, validUserId);
      assert.equal(result.email, 'newstudent@university.edu');
      assert.equal(result.role, 'STUDENT');
      assert.equal(result.token, `mock.jwt.token.${validUserId}.student`);

      // 2. Verify password hash was created
      assert.equal(hashCallCount, 1);

      // 3. Verify user and student creation in transaction
      assert.ok(createdUserData);
      assert.equal(createdUserData.email, 'newstudent@university.edu');
      assert.equal(createdUserData.password_hash, 'hashed_SecurePassword123!');
      assert.equal(createdUserData.role, 'STUDENT');

      assert.ok(createdStudentData);
      assert.equal(createdStudentData.user_id, validUserId);
      assert.equal(createdStudentData.first_name, '');
      assert.equal(createdStudentData.last_name, '');

      // 4. Verify welcome email background job enqueued
      assert.equal(enqueuedJobs.length, 1);
      assert.equal(
        enqueuedJobs[0].queueName,
        QUEUE_NAMES.NOTIFICATION_EMAIL_WELCOME
      );
      assert.deepEqual(enqueuedJobs[0].data, {
        userId: validUserId,
        email: 'newstudent@university.edu',
        role: 'STUDENT',
      });
      assert.deepEqual(enqueuedJobs[0].options, {
        singletonKey: `welcome:${validUserId}`,
        retryLimit: 3,
        retryDelay: 15,
        retryBackoff: true,
      });

      // 5. Verify secrets safety
      assert.equal('password_hash' in result, false);
      assert.equal('password' in result, false);
    });

    it('2.2. Successful recruiter registration: creates recruiter record and company in atomic transaction', async () => {
      let createdRecruiterData = null;

      mockPrisma.recruiter.create = async ({ data }) => {
        createdRecruiterData = data;
        return {
          id: 'recruiter-profile-1',
          first_name: data.first_name,
          last_name: data.last_name,
          is_approved: false,
        };
      };

      const result = await authService.register({
        email: 'recruiter@enterprise.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });

      assert.equal(result.user_id, validUserId);
      assert.equal(result.email, 'recruiter@enterprise.com');
      assert.equal(result.role, 'RECRUITER');

      // Verify recruiter specific structure
      assert.ok(createdRecruiterData);
      assert.deepEqual(createdRecruiterData.user, {
        connect: { id: validUserId },
      });
      assert.equal(createdRecruiterData.first_name, '');
      assert.equal(createdRecruiterData.last_name, '');
      assert.deepEqual(createdRecruiterData.company, {
        create: { name: '' },
      });

      // Verify welcome email enqueued for recruiter
      assert.equal(enqueuedJobs.length, 1);
      assert.equal(enqueuedJobs[0].data.role, 'RECRUITER');
    });

    it('2.3. Duplicate email: throws 409 ConflictException and prevents transaction execution', async () => {
      let transactionAttempted = false;
      mockPrisma.user.findUnique = async ({ where }) => {
        if (where.email === 'duplicate@example.com') {
          return { id: 'existing-uuid', email: 'duplicate@example.com' };
        }
        return null;
      };

      mockPrisma.$transaction = async (cb) => {
        transactionAttempted = true;
        return cb(mockPrisma);
      };

      await assert.rejects(
        () =>
          authService.register({
            email: 'duplicate@example.com',
            password: 'Password123!',
            role: 'STUDENT',
          }),
        (err) => {
          assert.ok(err instanceof ConflictException);
          assert.equal(err.status, 409);
          assert.equal(err.response.code, 'CONFLICT');
          assert.equal(err.response.message, 'Email is already registered');
          return true;
        }
      );

      // Verify no transaction and no password hashing occurred
      assert.equal(transactionAttempted, false);
      assert.equal(hashCallCount, 0);
      assert.equal(enqueuedJobs.length, 0);
      assert.equal(signTokenCallCount, 0);
    });

    it('2.4. Public registration as ADMIN: throws 400 BadRequestException defense-in-depth and halts immediately', async () => {
      let findUniqueAttempted = false;
      mockPrisma.user.findUnique = async () => {
        findUniqueAttempted = true;
        return null;
      };

      await assert.rejects(
        () =>
          authService.register({
            email: 'admin@careerforge.dev',
            password: 'AdminPassword123!',
            role: 'ADMIN',
          }),
        (err) => {
          assert.ok(err instanceof BadRequestException);
          assert.equal(err.status, 400);
          assert.equal(err.response.code, 'VALIDATION_ERROR');
          assert.equal(
            err.response.message,
            'Registration as ADMIN is not permitted'
          );
          return true;
        }
      );

      assert.equal(findUniqueAttempted, false);
      assert.equal(hashCallCount, 0);
      assert.equal(signTokenCallCount, 0);
      assert.equal(enqueuedJobs.length, 0);
    });

    it('2.5. Student transaction failure: propagates database error and aborts token signing / welcome email', async () => {
      mockPrisma.$transaction = async () => {
        throw new Error('Database transaction deadlocked');
      };

      await assert.rejects(
        () =>
          authService.register({
            email: 'fail.student@example.com',
            password: 'Password123!',
            role: 'STUDENT',
          }),
        (err) => {
          assert.equal(err.message, 'Database transaction deadlocked');
          return true;
        }
      );

      assert.equal(signTokenCallCount, 0);
      assert.equal(enqueuedJobs.length, 0);
    });

    it('2.6. Recruiter transaction failure: propagates database error and aborts token signing / welcome email', async () => {
      mockPrisma.$transaction = async (cb) => {
        const tx = {
          user: mockPrisma.user,
          student: mockPrisma.student,
          recruiter: {
            create: async () => {
              throw new Error('Foreign key violation on company creation');
            },
          },
        };
        return cb(tx);
      };

      await assert.rejects(
        () =>
          authService.register({
            email: 'fail.recruiter@example.com',
            password: 'Password123!',
            role: 'RECRUITER',
          }),
        (err) => {
          assert.equal(
            err.message,
            'Foreign key violation on company creation'
          );
          return true;
        }
      );

      assert.equal(signTokenCallCount, 0);
      assert.equal(enqueuedJobs.length, 0);
    });

    it('2.7. Welcome email queue failure is gracefully absorbed without failing registration', async () => {
      mockQueueService.send = async () => {
        throw new Error('pg-boss connection timeout');
      };

      const result = await authService.register({
        email: 'queue.resilient@example.com',
        password: 'Password123!',
        role: 'STUDENT',
      });

      // Registration succeeds despite queue failure
      assert.equal(result.user_id, validUserId);
      assert.equal(result.email, 'queue.resilient@example.com');
      assert.equal(result.token, `mock.jwt.token.${validUserId}.student`);
    });

    it('2.8. Registration when queueService is not injected: completes registration safely without errors', async () => {
      const authServiceNoQueue = new AuthService(
        mockPrisma,
        mockPasswordService,
        mockTokenService
      );

      const result = await authServiceNoQueue.register({
        email: 'no.queue@example.com',
        password: 'Password123!',
        role: 'STUDENT',
      });

      assert.equal(result.user_id, validUserId);
      assert.equal(result.email, 'no.queue@example.com');
      assert.equal(result.role, 'STUDENT');
      assert.ok(result.token);
    });
  });

  // ===========================================================================
  // 3. SECRETS & SECURITY INVARIANTS
  // ===========================================================================
  describe('3. Secrets & Payload Invariants', () => {
    it('3.1. Login response never exposes sensitive security properties', async () => {
      mockPrisma.user.findUnique = async () => ({
        id: validUserId,
        email: 'clean@example.com',
        password_hash: samplePasswordHash,
        role: 'STUDENT',
        is_banned: false,
      });

      const result = await authService.login({
        email: 'clean@example.com',
        password: 'CorrectPassword123!',
      });

      const forbiddenKeys = [
        'password',
        'password_hash',
        'salt',
        'secret',
        'jwtSecret',
        'is_banned',
      ];
      for (const key of forbiddenKeys) {
        assert.equal(
          key in result,
          false,
          `Key "${key}" must NOT be exposed in login result`
        );
      }
    });

    it('3.2. Registration response never exposes sensitive security properties', async () => {
      const result = await authService.register({
        email: 'clean.reg@example.com',
        password: 'CorrectPassword123!',
        role: 'STUDENT',
      });

      const forbiddenKeys = [
        'password',
        'password_hash',
        'salt',
        'secret',
        'jwtSecret',
      ];
      for (const key of forbiddenKeys) {
        assert.equal(
          key in result,
          false,
          `Key "${key}" must NOT be exposed in registration result`
        );
      }
    });
  });
});
