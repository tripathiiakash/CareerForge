import { Injectable } from '@nestjs/common';
import { AppConfig, NodeEnv } from './config.types';
import { validateEnvironment } from './config.validator';

/**
 * ConfigService encapsulates typed access to validated environment configuration.
 * Injected anywhere configuration parameters are needed.
 */
@Injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    this.config = validateEnvironment(process.env);
  }

  get nodeEnv(): NodeEnv {
    return this.config.nodeEnv;
  }

  get isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  get isTest(): boolean {
    return this.config.nodeEnv === 'test';
  }

  get port(): number {
    return this.config.port;
  }

  get corsOrigin(): string {
    return this.config.corsOrigin;
  }

  get databaseUrl(): string {
    return this.config.databaseUrl;
  }

  get pgBossSchema(): string {
    return this.config.pgBossSchema;
  }

  get jwtSecret(): string {
    return this.config.jwtSecret;
  }

  get jwtExpiresIn(): string {
    return this.config.jwtExpiresIn;
  }

  get geminiApiKey(): string | undefined {
    return this.config.geminiApiKey;
  }

  get storageProvider(): string {
    return this.config.storageProvider ?? 'local';
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }
}
