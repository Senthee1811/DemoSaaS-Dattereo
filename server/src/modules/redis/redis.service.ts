import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private _isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      const host = this.configService.get<string>('redis.host') || 'localhost';
      const port = this.configService.get<number>('redis.port') || 6379;
      const password = this.configService.get<string>('redis.password') || undefined;

      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 5) {
            this.logger.error('Redis connection failed after 5 retries. Fail-closed policy active.');
            return null; // Stop retrying
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this._isConnected = true;
        this.logger.log('Connected to Redis');
      });

      this.client.on('error', (err) => {
        this._isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}. Fail-closed policy enforced.`);
      });

      this.client.on('close', () => {
        this._isConnected = false;
      });

      await this.client.connect();
    } catch (err: any) {
      this._isConnected = false;
      this.logger.warn(`Redis initialization deferred: ${err.message}. Operating in fail-closed mode.`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Get the raw Redis client. Returns null if not connected.
   * Callers MUST handle null (fail-closed).
   */
  getClient(): Redis | null {
    return this._isConnected ? this.client : null;
  }

  /**
   * Get current monthly spend for a project from Redis cache.
   * Returns null if Redis is unavailable (caller must fail-closed).
   */
  async getProjectSpend(projectId: string): Promise<number | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const key = this.getSpendKey(projectId);
      const value = await client.get(key);
      return value !== null ? parseFloat(value) : 0;
    } catch (err: any) {
      this.logger.warn(`Failed to read spend from Redis: ${err.message}`);
      return null;
    }
  }

  /**
   * Increment project spend in Redis after a successful request.
   */
  async incrementProjectSpend(projectId: string, amount: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    try {
      const key = this.getSpendKey(projectId);
      await client.incrbyfloat(key, amount);

      // Set TTL to end of current month + 1 day buffer
      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const ttlSeconds = Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000) + 86400;
      await client.expire(key, ttlSeconds);
    } catch (err: any) {
      this.logger.warn(`Failed to increment spend in Redis: ${err.message}`);
    }
  }

  /**
   * Set project spend to a specific value (used by reconciliation job).
   */
  async setProjectSpend(projectId: string, amount: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    try {
      const key = this.getSpendKey(projectId);
      await client.set(key, amount.toString());

      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const ttlSeconds = Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000) + 86400;
      await client.expire(key, ttlSeconds);
    } catch (err: any) {
      this.logger.warn(`Failed to set spend in Redis: ${err.message}`);
    }
  }

  /**
   * Health check — attempt a PING.
   */
  async healthCheck(): Promise<string> {
    const client = this.getClient();
    if (!client) return 'disconnected';

    try {
      const result = await client.ping();
      return result === 'PONG' ? 'healthy' : 'degraded';
    } catch {
      return 'degraded';
    }
  }

  private getSpendKey(projectId: string): string {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `spendguard:spend:${projectId}:${monthKey}`;
  }
}
