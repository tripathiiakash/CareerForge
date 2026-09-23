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

  get s3Endpoint(): string | undefined {
    return this.config.s3Endpoint;
  }

  get s3Region(): string {
    return this.config.s3Region ?? 'auto';
  }

  get s3Bucket(): string | undefined {
    return this.config.s3Bucket;
  }

  get s3AccessKeyId(): string | undefined {
    return this.config.s3AccessKeyId;
  }

  get s3SecretAccessKey(): string | undefined {
    return this.config.s3SecretAccessKey;
  }

  get s3ForcePathStyle(): boolean {
    return this.config.s3ForcePathStyle ?? false;
  }

  get emailProvider(): string {
    return this.config.emailProvider ?? 'mock';
  }

  get resendApiKey(): string | undefined {
    return this.config.resendApiKey;
  }

  get emailFrom(): string {
    return (
      this.config.emailFrom ?? 'CareerForge <notifications@careerforge.dev>'
    );
  }

  get rateLimitEnabled(): boolean {
    return this.config.rateLimitEnabled ?? true;
  }

  get rateLimitAuthMax(): number {
    return this.config.rateLimitAuthMax ?? 10;
  }

  get rateLimitAiMax(): number {
    return this.config.rateLimitAiMax ?? 10;
  }

  get rateLimitPublicMax(): number {
    return this.config.rateLimitPublicMax ?? 60;
  }

  get rateLimitGlobalMax(): number {
    return this.config.rateLimitGlobalMax ?? 120;
  }

  get rateLimitWindowSeconds(): number {
    return this.config.rateLimitWindowSeconds ?? 60;
  }

  get trustProxy(): boolean | number | string {
    return this.config.trustProxy ?? (this.isProduction ? 1 : false);
  }

  get authCookieName(): string {
    return this.config.authCookieName ?? 'cf_auth';
  }

  get authCookieMaxAgeSec(): number {
    return this.config.authCookieMaxAgeSec ?? 7 * 24 * 3600;
  }

  get authCookieSameSite(): 'lax' | 'strict' | 'none' {
    return this.config.authCookieSameSite ?? 'lax';
  }

  get maxApplicationsPerStudent(): number {
    return this.config.maxApplicationsPerStudent ?? 100;
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }
}
