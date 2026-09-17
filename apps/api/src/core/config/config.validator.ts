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
  if (
    isProduction &&
    corsOrigin
      .split(',')
      .map((s) => s.trim())
      .includes('*')
  ) {
    errors.push('CORS_ORIGIN must not be wildcard (*) in production');
  }

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

  // 9. EMAIL_PROVIDER, RESEND_API_KEY & EMAIL_FROM
  const resendApiKey = env.RESEND_API_KEY?.trim() || undefined;
  const emailFrom =
    env.EMAIL_FROM?.trim() ||
    env.RESEND_FROM_EMAIL?.trim() ||
    'CareerForge <notifications@careerforge.dev>';
  const rawEmailProvider = env.EMAIL_PROVIDER?.trim()?.toLowerCase();
  const emailProvider = rawEmailProvider || 'mock';

  if (rawEmailProvider && !['resend', 'mock'].includes(rawEmailProvider)) {
    errors.push(
      `EMAIL_PROVIDER must be one of: 'resend', 'mock' (received "${rawEmailProvider}")`
    );
  }

  if (rawEmailProvider === 'resend') {
    if (
      !resendApiKey ||
      resendApiKey === 'your-resend-api-key-here' ||
      resendApiKey.startsWith('your-')
    ) {
      errors.push(
        'RESEND_API_KEY is required and must not be a placeholder when EMAIL_PROVIDER is "resend"'
      );
    }
  }

  // 10. Rate Limiting Configuration
  const rateLimitEnabled = env.RATE_LIMIT_ENABLED
    ? env.RATE_LIMIT_ENABLED.trim().toLowerCase() !== 'false'
    : true;

  const parseOptionalInt = (
    val: string | undefined,
    defaultVal: number
  ): number => {
    if (!val) return defaultVal;
    const parsed = parseInt(val.trim(), 10);
    return Number.isNaN(parsed) || parsed < 1 ? defaultVal : parsed;
  };

  const rateLimitAuthMax = parseOptionalInt(env.RATE_LIMIT_AUTH_MAX, 10);
  const rateLimitAiMax = parseOptionalInt(env.RATE_LIMIT_AI_MAX, 10);
  const rateLimitPublicMax = parseOptionalInt(env.RATE_LIMIT_PUBLIC_MAX, 60);
  const rateLimitGlobalMax = parseOptionalInt(env.RATE_LIMIT_GLOBAL_MAX, 120);
  const rateLimitWindowSeconds = parseOptionalInt(
    env.RATE_LIMIT_WINDOW_SECONDS,
    60
  );

  // 11. Trust Proxy Configuration
  let trustProxy: boolean | number | string = isProduction ? 1 : false;
  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY.trim().length > 0) {
    const rawTrustProxy = env.TRUST_PROXY.trim().toLowerCase();
    if (rawTrustProxy === 'true') {
      trustProxy = true;
    } else if (rawTrustProxy === 'false') {
      trustProxy = false;
    } else {
      const parsedNum = parseInt(rawTrustProxy, 10);
      if (!Number.isNaN(parsedNum) && parsedNum >= 0) {
        trustProxy = parsedNum;
      } else {
        trustProxy = env.TRUST_PROXY.trim();
      }
    }
  }

  // 12. Cookie Configuration
  const authCookieName = env.AUTH_COOKIE_NAME?.trim() || 'cf_auth';
  const authCookieMaxAgeSec = parseOptionalInt(
    env.AUTH_COOKIE_MAX_AGE_SEC,
    7 * 24 * 3600 // 7 days, matching default jwtExpiresIn
  );

  const rawSameSite = env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
  let authCookieSameSite: 'lax' | 'strict' | 'none' = 'lax';
  if (rawSameSite) {
    if (rawSameSite === 'lax' || rawSameSite === 'strict' || rawSameSite === 'none') {
      authCookieSameSite = rawSameSite;
    } else {
      errors.push(`AUTH_COOKIE_SAMESITE must be 'lax', 'strict', or 'none'`);
    }
  }

  // 13. Application Limits
  const maxApplicationsPerStudent = parseOptionalInt(
    env.MAX_APPLICATIONS_PER_STUDENT || env.STUDENT_APPLICATION_LIMIT,
    100
  );

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
    emailProvider,
    resendApiKey,
    emailFrom,
    rateLimitEnabled,
    rateLimitAuthMax,
    rateLimitAiMax,
    rateLimitPublicMax,
    rateLimitGlobalMax,
    rateLimitWindowSeconds,
    trustProxy,
    authCookieName,
    authCookieMaxAgeSec,
    authCookieSameSite,
    maxApplicationsPerStudent,
  };
}
