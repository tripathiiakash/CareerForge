import { globSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.resolve(__dirname, '..');

// Discover all existing unit tests (*.test.js) and DOM component tests (*.test.tsx)
const jsFiles = globSync('*.test.js', { cwd: testDir })
  .sort()
  .map((f) => path.join('test', f));

const tsxFiles = globSync('*.test.tsx', { cwd: testDir })
  .sort()
  .map((f) => path.join('test', f));

const allFiles = [...jsFiles, ...tsxFiles];

if (allFiles.length === 0) {
  console.log('No web test files found.');
  process.exit(0);
}

const extraArgs = process.argv.slice(2);
const registerScript = path.join('test', 'setup', 'register-loader.js');
const args = [
  '--import',
  `./${registerScript}`,
  '--test',
  ...extraArgs,
  ...allFiles,
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
