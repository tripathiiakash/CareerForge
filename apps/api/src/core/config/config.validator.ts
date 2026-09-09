import { AppConfig, NodeEnv } from './config.types';

export class ConfigValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(
      `Environment configuration validation failed:\n${errors
        .map((e) => `  - ${e}`)
        .join('\n')}\nPlease check your .env file against .env.example.`
    );
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates raw environment variables against the application configuration schema.
 * Throws a descriptive ConfigValidationError if any required configuration is invalid.
 */
export function validateEnvironment(env: NodeJS.ProcessEnv): AppConfig {
  const errors: string[] = [];

  // 1. NODE_ENV
  const rawNodeEnv = env.NODE_ENV?.trim() || 'development';
  const validEnvs: NodeEnv[] = ['development', 'production', 'test'];
  if (!validEnvs.includes(rawNodeEnv as NodeEnv)) {
    errors.push(
      `NODE_ENV must be one of [${validEnvs.join(', ')}] (received "${rawNodeEnv}")`
    );
  }
  const nodeEnv = (
    validEnvs.includes(rawNodeEnv as NodeEnv) ? rawNodeEnv : 'development'
  ) as NodeEnv;
  const isProduction = nodeEnv === 'production';

  // 2. PORT
  const rawPort = env.PORT?.trim() || '5000';
  const port = parseInt(rawPort, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    errors.push(
      `PORT must be an integer between 1 and 65535 (received "${rawPort}")`
    );
  }

  // 3. CORS_ORIGIN
  const corsOrigin = env.CORS_ORIGIN?.trim() || 'http://localhost:5173';

  // 4. DATABASE_URL
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    errors.push(
      'DATABASE_URL is required (e.g. postgresql://user:password@localhost:5432/careerforge?schema=public)'
    );
  } else if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    errors.push(
      'DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://'
    );
  }

  // 5. PG_BOSS_SCHEMA
  const pgBossSchema = env.PG_BOSS_SCHEMA?.trim() || 'pgboss';

  // 6. JWT_SECRET
  const placeholderSecret = 'your-secure-jwt-secret-min-32-characters';
  let jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret && !isProduction) {
    jwtSecret = 'local-dev-jwt-secret-replace-before-production';
  }

  if (!jwtSecret) {
    errors.push('JWT_SECRET is required');
  } else if (isProduction) {
    if (jwtSecret === placeholderSecret) {
      errors.push(
        'JWT_SECRET must not use the default template placeholder in production'
      );
    } else if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
  }

  // 7. JWT_EXPIRES_IN
  const jwtExpiresIn = env.JWT_EXPIRES_IN?.trim() || '7d';

  // 8. GEMINI_API_KEY & STORAGE_PROVIDER
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || undefined;
  const storageProvider = env.STORAGE_PROVIDER?.trim() || 'local';

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return {
    nodeEnv,
    port,
    corsOrigin,
    databaseUrl: databaseUrl!,
    pgBossSchema,
    jwtSecret: jwtSecret!,
    jwtExpiresIn,
    geminiApiKey,
    storageProvider,
  };
}
