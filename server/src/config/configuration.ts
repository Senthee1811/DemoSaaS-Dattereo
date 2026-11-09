import { Logger } from '@nestjs/common';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiration: string;
    refreshExpiration: string;
  };
  encryptionMasterKey: string;
  gateway: {
    failClosedOnError: boolean;
    timeoutMs: number;
  };
}

/**
 * Validates that all required environment variables are present.
 * The app must refuse to start if a critical env var is missing.
 */
function validateRequiredEnvVars(): void {
  const logger = new Logger('ConfigValidation');
  const required: { key: string; description: string }[] = [
    { key: 'DATABASE_URL', description: 'PostgreSQL connection URL' },
    { key: 'REDIS_HOST', description: 'Redis server host' },
    { key: 'JWT_ACCESS_SECRET', description: 'JWT access token signing secret' },
    { key: 'JWT_REFRESH_SECRET', description: 'JWT refresh token signing secret' },
    { key: 'ENCRYPTION_MASTER_KEY', description: 'Master key for API key envelope encryption' },
  ];

  const missing: string[] = [];

  for (const { key, description } of required) {
    if (!process.env[key]) {
      missing.push(`  - ${key}: ${description}`);
    }
  }

  if (missing.length > 0) {
    const message = [
      '',
      '╔══════════════════════════════════════════════════════════════╗',
      '║  FATAL: Missing required environment variables              ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      ...missing,
      '',
      'Copy server/.env.example to server/.env and fill in the values.',
      '',
    ].join('\n');

    logger.error(message);
    throw new Error(`Missing required environment variables: ${missing.map(m => m.trim().split(':')[0].replace('- ', '')).join(', ')}`);
  }
}

export default (): AppConfig => {
  // Validate on first load
  validateRequiredEnvVars();

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '4000', 10),
    databaseUrl: process.env.DATABASE_URL!,
    redis: {
      host: process.env.REDIS_HOST!,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET!,
      refreshSecret: process.env.JWT_REFRESH_SECRET!,
      accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
      refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
    },
    encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY!,
    gateway: {
      failClosedOnError: process.env.GATEWAY_FAIL_CLOSED_ON_ERROR !== 'false',
      timeoutMs: parseInt(process.env.GATEWAY_PROXY_TIMEOUT_MS || '60000', 10),
    },
  };
};
