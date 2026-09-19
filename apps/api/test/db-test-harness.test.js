const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertSafeTestDatabase,
  getTestDatabaseUrl,
  createTestPrisma,
} = require('./setup/db-test-harness');

describe('Database Test Harness Safety Suite (Phase 6.6-E1)', () => {
  describe('assertSafeTestDatabase', () => {
    it('should accept a valid PostgreSQL URL targeting careerforge_test', () => {
      const url =
        'postgresql://postgres:postgres@localhost:5432/careerforge_test?schema=public';
      const result = assertSafeTestDatabase(url);
      assert.equal(result, url);
    });

    it('should accept postgres: protocol and test database names ending with _test or -test', () => {
      const url1 = 'postgres://user:pass@localhost:5432/myapp_test';
      const url2 = 'postgresql://user:pass@localhost:5432/app-test';
      const url3 = 'postgresql://user:pass@localhost:5432/test_database';

      assert.equal(assertSafeTestDatabase(url1), url1);
      assert.equal(assertSafeTestDatabase(url2), url2);
      assert.equal(assertSafeTestDatabase(url3), url3);
    });

    it('should reject missing, empty, or non-string URLs', () => {
      assert.throws(
        () => assertSafeTestDatabase(null),
        /TEST_DATABASE_URL must be a non-empty string/
      );
      assert.throws(
        () => assertSafeTestDatabase(''),
        /TEST_DATABASE_URL must be a non-empty string/
      );
      assert.throws(
        () => assertSafeTestDatabase('   '),
        /TEST_DATABASE_URL must be a non-empty string/
      );
    });

    it('should reject non-PostgreSQL protocols', () => {
      assert.throws(
        () => assertSafeTestDatabase('mysql://localhost:3306/careerforge_test'),
        /TEST_DATABASE_URL must use postgresql: or postgres: protocol/
      );
      assert.throws(
        () => assertSafeTestDatabase('http://localhost:5432/careerforge_test'),
        /TEST_DATABASE_URL must use postgresql: or postgres: protocol/
      );
    });

    it('should strictly reject development database name "careerforge"', () => {
      const devUrl =
        'postgresql://postgres:postgres@localhost:5432/careerforge?schema=public';
      assert.throws(
        () => assertSafeTestDatabase(devUrl),
        /SAFETY VIOLATION: TEST_DATABASE_URL cannot target the development database 'careerforge'/
      );
    });

    it('should strictly reject production, staging, and system databases', () => {
      const dangerousList = [
        'postgresql://postgres:postgres@localhost:5432/careerforge_prod',
        'postgresql://postgres:postgres@localhost:5432/careerforge_production',
        'postgresql://postgres:postgres@localhost:5432/careerforge_staging',
        'postgresql://postgres:postgres@localhost:5432/prod',
        'postgresql://postgres:postgres@localhost:5432/production',
        'postgresql://postgres:postgres@localhost:5432/staging',
        'postgresql://postgres:postgres@localhost:5432/postgres',
      ];

      for (const dangerousUrl of dangerousList) {
        assert.throws(
          () => assertSafeTestDatabase(dangerousUrl),
          /SAFETY VIOLATION/
        );
      }
    });

    it('should reject URLs without an explicit database name in pathname', () => {
      assert.throws(
        () => assertSafeTestDatabase('postgresql://localhost:5432/'),
        /TEST_DATABASE_URL must specify an explicit database name/
      );
      assert.throws(
        () => assertSafeTestDatabase('postgresql://localhost:5432'),
        /TEST_DATABASE_URL must specify an explicit database name/
      );
    });

    it('should reject arbitrary database names not following safe test conventions', () => {
      assert.throws(
        () => assertSafeTestDatabase('postgresql://localhost:5432/mydb'),
        /SAFETY VIOLATION: TEST_DATABASE_URL database name 'mydb' does not follow a safe test naming convention/
      );
      assert.throws(
        () =>
          assertSafeTestDatabase('postgresql://localhost:5432/careerforge_dev'),
        /SAFETY VIOLATION/
      );
    });
  });

  describe('getTestDatabaseUrl', () => {
    it('should throw immediately when TEST_DATABASE_URL environment variable is missing or empty', () => {
      const originalEnv = process.env.TEST_DATABASE_URL;
      try {
        delete process.env.TEST_DATABASE_URL;
        assert.throws(
          () => getTestDatabaseUrl(),
          /TEST_DATABASE_URL environment variable is required for integration tests/
        );
      } finally {
        if (originalEnv !== undefined) {
          process.env.TEST_DATABASE_URL = originalEnv;
        }
      }
    });

    it('should never fall back to DATABASE_URL when TEST_DATABASE_URL is missing', () => {
      const originalTestEnv = process.env.TEST_DATABASE_URL;
      const originalDbEnv = process.env.DATABASE_URL;
      try {
        delete process.env.TEST_DATABASE_URL;
        process.env.DATABASE_URL =
          'postgresql://postgres:postgres@localhost:5432/careerforge';

        assert.throws(
          () => getTestDatabaseUrl(),
          /TEST_DATABASE_URL environment variable is required for integration tests/
        );
      } finally {
        if (originalTestEnv !== undefined) {
          process.env.TEST_DATABASE_URL = originalTestEnv;
        }
        if (originalDbEnv !== undefined) {
          process.env.DATABASE_URL = originalDbEnv;
        }
      }
    });
  });

  describe('createTestPrisma', () => {
    it('should fail before importing/instantiating Prisma when TEST_DATABASE_URL is missing', () => {
      const originalTestEnv = process.env.TEST_DATABASE_URL;
      try {
        delete process.env.TEST_DATABASE_URL;
        assert.throws(
          () => createTestPrisma(),
          /TEST_DATABASE_URL environment variable is required for integration tests/
        );
      } finally {
        if (originalTestEnv !== undefined) {
          process.env.TEST_DATABASE_URL = originalTestEnv;
        }
      }
    });
  });
});
