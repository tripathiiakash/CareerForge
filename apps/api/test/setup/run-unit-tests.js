/**
 * Cross-platform Unit Test Runner (Phase 6.6-E1)
 *
 * Runs all unit/regression tests (*.test.js) in apps/api/test/
 * strictly excluding integration tests (*.integration.test.js).
 * Avoids PowerShell and Bash glob sensitivity across environments.
 */

const { globSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const testDir = path.resolve(__dirname, '..');

// Discover all *.test.js files, explicitly filtering out integration tests
const files = globSync('*.test.js', { cwd: testDir })
  .filter((f) => !f.includes('.integration.'))
  .sort()
  .map((f) => path.join('test', f));

if (files.length === 0) {
  console.log('No unit test files found.');
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
