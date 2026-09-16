export type NodeEnv = 'development' | 'production' | 'test';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly corsOrigin: string;
  readonly databaseUrl: string;
  readonly pgBossSchema: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly geminiApiKey?: string;
  readonly storageProvider?: string;
  readonly emailProvider?: string;
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly rateLimitEnabled?: boolean;
  readonly rateLimitAuthMax?: number;
  readonly rateLimitAiMax?: number;
  readonly rateLimitPublicMax?: number;
  readonly rateLimitGlobalMax?: number;
  readonly rateLimitWindowSeconds?: number;
}
