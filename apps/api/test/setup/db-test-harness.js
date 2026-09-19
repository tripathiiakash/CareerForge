/**
 * Database Integration Test Harness & Safety Layer (Phase 6.6-E1)
 *
 * Enforces strict isolation between development databases and integration tests:
 * 1. Requires explicit TEST_DATABASE_URL environment variable.
 * 2. Never falls back to DATABASE_URL.
 * 3. Never reads development database credentials automatically.
 * 4. Strictly validates database name against test naming conventions.
 * 5. Rejects development, production, and staging database names.
 * 6. Provides safe test-specific PrismaClient instantiation and connection verification.
 */

/**
 * Validates and returns the TEST_DATABASE_URL.
 * Throws a fatal error if missing or unsafe.
 *
 * @returns {string} The validated test database URL.
 */
function getTestDatabaseUrl() {
  const rawUrl = process.env.TEST_DATABASE_URL;

  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL environment variable is required for integration tests.\n' +
      'It must not be omitted and must not fall back to DATABASE_URL.\n' +
      'Example: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/careerforge_test?schema=public'
    );
  }

  return assertSafeTestDatabase(rawUrl);
}

/**
 * Validates that a given PostgreSQL URL points to a dedicated, safe test database.
 * Throws an error if the URL targets a development, staging, or production database.
 *
 * @param {string} rawUrl - The database URL to validate.
 * @returns {string} The validated URL.
 */
function assertSafeTestDatabase(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error('TEST_DATABASE_URL must be a non-empty string');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error(`Invalid TEST_DATABASE_URL format: ${err.message}`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `TEST_DATABASE_URL must use postgresql: or postgres: protocol. Received: '${parsed.protocol}'`
    );
  }

  // Extract database name from pathname (e.g., "/careerforge_test" -> "careerforge_test")
  const dbName = parsed.pathname.replace(/^\//, '').split('/')[0]?.split('?')[0];

  if (!dbName || dbName.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL must specify an explicit database name in the path.'
    );
  }

  const lowerDbName = dbName.toLowerCase();

  // Strict check: reject development database
  if (lowerDbName === 'careerforge') {
    throw new Error(
      "SAFETY VIOLATION: TEST_DATABASE_URL cannot target the development database 'careerforge'. " +
      "It must target a dedicated test database such as 'careerforge_test'."
    );
  }

  // Strict check: reject production, staging, and system databases
  const dangerousNames = [
    'prod',
    'production',
    'staging',
    'stage',
    'live',
    'main',
    'master',
    'postgres',
    'careerforge_prod',
    'careerforge_production',
    'careerforge_staging',
  ];

  if (dangerousNames.includes(lowerDbName)) {
    throw new Error(
      `SAFETY VIOLATION: TEST_DATABASE_URL cannot target production, staging, or system database '${dbName}'.`
    );
  }

  // Enforce safe test naming convention
  const isSafeTestName =
    lowerDbName === 'careerforge_test' ||
    lowerDbName.endsWith('_test') ||
    lowerDbName.endsWith('-test') ||
    lowerDbName.startsWith('test_') ||
    lowerDbName.startsWith('test-');

  if (!isSafeTestName) {
    throw new Error(
      `SAFETY VIOLATION: TEST_DATABASE_URL database name '${dbName}' does not follow a safe test naming convention. ` +
      "It must match 'careerforge_test' or end with '_test' / '-test'."
    );
  }

  return rawUrl;
}

/**
 * Creates an isolated PrismaClient instance connected strictly to TEST_DATABASE_URL.
 * Does not import or instantiate Prisma until after safety checks have passed.
 *
 * @param {object} [options] - Additional PrismaClient options.
 * @returns {import('@prisma/client').PrismaClient}
 */
function createTestPrisma(options = {}) {
  const url = getTestDatabaseUrl();
  const { PrismaClient } = require('@prisma/client');

  return new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
    ...options,
  });
}

/**
 * Asserts that PostgreSQL is reachable on TEST_DATABASE_URL within a short timeout.
 * Fails fast with an actionable message if the database server is offline.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} [timeoutMs=3000] - Connection timeout in milliseconds.
 */
async function assertDatabaseReachable(prisma, timeoutMs = 3000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Database connection timed out after ${timeoutMs}ms. ` +
          'Ensure PostgreSQL is running and accessible on the host/port in TEST_DATABASE_URL.'
        )
      );
    }, timeoutMs);
  });

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      timeoutPromise,
    ]);
  } catch (err) {
    throw new Error(
      `PostgreSQL test database unreachable: ${err.message}.\n` +
      'Ensure PostgreSQL is running (e.g. docker compose up -d postgres) and accessible at TEST_DATABASE_URL.'
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asserts that Prisma migrations have been applied to the test database.
 * Checks for the presence of core application tables.
 * Fails fast with an actionable migration command if tables are missing.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function assertMigrationsApplied(prisma) {
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'students', 'jobs', 'rate_limits', 'email_deliveries')
    `;

    if (!Array.isArray(tables) || tables.length < 5) {
      throw new Error(
        'Required database tables are missing in the test database.\n' +
        'Please deploy migrations to the test database with:\n' +
        'DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma'
      );
    }
  } catch (err) {
    throw new Error(
      `Database schema verification failed: ${err.message}.\n` +
      'Please ensure migrations are applied with:\n' +
      'DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma'
    );
  }
}

module.exports = {
  getTestDatabaseUrl,
  assertSafeTestDatabase,
  createTestPrisma,
  assertDatabaseReachable,
  assertMigrationsApplied,
};
