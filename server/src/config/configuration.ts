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

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'production',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/spendguard?schema=public',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'spendguard-jwt-access-secret-32b-min!',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'spendguard-jwt-refresh-secret-32b-min!',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY || 'spendguard-master-encryption-key-32b!',
  gateway: {
    failClosedOnError: process.env.GATEWAY_FAIL_CLOSED_ON_ERROR !== 'false',
    timeoutMs: parseInt(process.env.GATEWAY_PROXY_TIMEOUT_MS || '60000', 10),
  },
});
