import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Loads the appropriate .env file into process.env using Node 20.12+/24+ native process.loadEnvFile().
 * In production or CI/CD container environments where environment variables are injected directly,
 * this function gracefully succeeds without throwing if no .env file is present.
 */
export function loadEnvironment(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
      return;
    }
  }
}
