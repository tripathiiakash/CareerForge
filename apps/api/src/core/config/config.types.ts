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
}
