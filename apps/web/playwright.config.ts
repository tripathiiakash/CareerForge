import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 7000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: path.resolve(__dirname, '../api'),
      url: 'http://localhost:5000/api/v1/jobs',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        PORT: '5000',
        NODE_ENV: 'test',
        DATABASE_URL:
          'postgresql://postgres:postgres@127.0.0.1:5432/careerforge_e2e?schema=public',
        JWT_SECRET: 'e2e-test-jwt-secret-minimum-32-chars-long-key',
        RATE_LIMIT_ENABLED: 'false',
        EMAIL_PROVIDER: 'mock',
        STORAGE_PROVIDER: 'local',
        CORS_ORIGIN: 'http://localhost:5173',
        PG_BOSS_SCHEMA: 'pgboss_e2e',
      },
    },
    {
      command: 'npx vite --port 5173',
      cwd: __dirname,
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
