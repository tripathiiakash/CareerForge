/**
 * Cross-platform Integration Test Runner (Phase 6.6-E1)
 *
 * Runs all database integration tests (*.integration.test.js) in apps/api/test/.
 * Performs pre-flight safety checks to ensure TEST_DATABASE_URL is set and valid
 * BEFORE invoking Node test runner or loading any Prisma dependencies.
 */

const { globSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');
const { getTestDatabaseUrl } = require('./db-test-harness');

// Pre-flight safety check: fail fast before running any tests
try {
  getTestDatabaseUrl();
} catch (err) {
  console.error('\n======================================================');
  console.error('INTEGRATION TEST PRECONDITION ERROR');
  console.error('======================================================');
  console.error(err.message);
  console.error('======================================================\n');
  process.exit(1);
}

const testDir = path.resolve(__dirname, '..');

// Discover all *.integration.test.js files
const files = globSync('*.integration.test.js', { cwd: testDir })
  .sort()
  .map((f) => path.join('test', f));

if (files.length === 0) {
  console.log('No integration test files found.');
  process.exit(0);
}

// Forward any extra arguments (e.g., --test-name-pattern, --test-timeout)
const extraArgs = process.argv.slice(2);
const args = ['--test', ...extraArgs, ...files];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
