import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Reconnect backoff: 200 ms, 400 ms, ... capped at 5 s. Never gives up. */
export function redisRetryDelayMs(times: number): number {
  return Math.min(times * 200, 5000);
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private _isConnected = false;
  /** Log one error per outage instead of one per reconnect attempt. */
  private outageLogged = false;

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
        // Retry forever with capped backoff. Giving up left the gateway at 503
        // until the backend was restarted, even after Redis came back.
        retryStrategy: (times) => redisRetryDelayMs(times),
        lazyConnect: true,
      });

      // Only 'ready' means commands can run. Until then getClient() returns null
      // and the gateway fails closed (503 governance_unavailable).
      this.client.on('ready', () => {
        this._isConnected = true;
        this.outageLogged = false;
        this.logger.log('Redis ready');
      });

      this.client.on('error', (err) => {
        this._isConnected = false;
        if (!this.outageLogged) {
          this.outageLogged = true;
          this.logger.error(`Redis connection error: ${err.message}. Fail-closed policy enforced; reconnecting.`);
        }
      });

      this.client.on('close', () => {
        this._isConnected = false;
      });

      this.client.on('reconnecting', () => {
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

  /**
   * Atomic Budget Reservation (Lua Script)
   * Evaluates (currentSpend + currentReserved + estimatedAmount <= budgetCap) atomically.
   * If valid, increments reserved_key and sets a 5-minute TTL to prevent leaks.
   */
  async reserveBudget(
    projectId: string,
    estimatedAmount: number,
    budgetCap: number,
  ): Promise<{ success: boolean; currentSpend: number; currentReserved: number } | null> {
    const client = this.getClient();
    if (!client) return null; // Caller must fail-closed

    const spendKey = this.getSpendKey(projectId);
    const reservedKey = this.getReservedKey(projectId);

    const luaScript = `
      local spend_key = KEYS[1]
      local reserved_key = KEYS[2]
      local estimated = tonumber(ARGV[1])
      local cap = tonumber(ARGV[2])

      local current_spend = tonumber(redis.call('get', spend_key) or '0')
      local current_reserved = tonumber(redis.call('get', reserved_key) or '0')

      if (current_spend + current_reserved + estimated) > cap then
        return {0, tostring(current_spend), tostring(current_reserved)}
      else
        local new_reserved = redis.call('incrbyfloat', reserved_key, estimated)
        redis.call('expire', reserved_key, 300)
        return {1, tostring(current_spend), tostring(new_reserved)}
      end
    `;

    try {
      const result: any = await client.eval(
        luaScript,
        2,
        spendKey,
        reservedKey,
        estimatedAmount.toString(),
        budgetCap.toString(),
      );

      const allowed = Number(result[0]) === 1;
      const currentSpend = parseFloat(result[1]);
      const currentReserved = parseFloat(result[2]);

      return {
        success: allowed,
        currentSpend,
        currentReserved,
      };
    } catch (err: any) {
      this.logger.error(`Failed to execute atomic budget reservation: ${err.message}`);
      return null;
    }
  }

  /**
   * Atomic Budget Reconciliation (Lua Script)
   * Releases estimated reservation from reserved_key and adds verified actualCost to spend_key.
   */
  async reconcileBudget(
    projectId: string,
    estimatedAmount: number,
    actualCost: number,
  ): Promise<{ newSpend: number; newReserved: number } | null> {
    const client = this.getClient();
    if (!client) return null;

    const spendKey = this.getSpendKey(projectId);
    const reservedKey = this.getReservedKey(projectId);

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const ttlSeconds = Math.ceil((endOfMonth.getTime() - now.getTime()) / 1000) + 86400;

    const luaScript = `
      local spend_key = KEYS[1]
      local reserved_key = KEYS[2]
      local estimated = tonumber(ARGV[1])
      local actual = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])

      local current_reserved = tonumber(redis.call('get', reserved_key) or '0')
      local new_reserved = math.max(0, current_reserved - estimated)
      if new_reserved == 0 then
        redis.call('del', reserved_key)
      else
        redis.call('set', reserved_key, tostring(new_reserved), 'EX', 300)
      end

      local new_spend = redis.call('incrbyfloat', spend_key, actual)
      redis.call('expire', spend_key, ttl)

      return {tostring(new_spend), tostring(new_reserved)}
    `;

    try {
      const result: any = await client.eval(
        luaScript,
        2,
        spendKey,
        reservedKey,
        estimatedAmount.toString(),
        actualCost.toString(),
        ttlSeconds.toString(),
      );

      return {
        newSpend: parseFloat(result[0]),
        newReserved: parseFloat(result[1]),
      };
    } catch (err: any) {
      this.logger.error(`Failed to reconcile budget in Redis: ${err.message}`);
      return null;
    }
  }

  /**
   * Release reserved capacity when request fails or times out.
   */
  async releaseReservation(projectId: string, estimatedAmount: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const reservedKey = this.getReservedKey(projectId);

    const luaScript = `
      local reserved_key = KEYS[1]
      local estimated = tonumber(ARGV[1])

      local current_reserved = tonumber(redis.call('get', reserved_key) or '0')
      local new_reserved = math.max(0, current_reserved - estimated)
      if new_reserved == 0 then
        redis.call('del', reserved_key)
      else
        redis.call('set', reserved_key, tostring(new_reserved), 'EX', 300)
      end
      return tostring(new_reserved)
    `;

    try {
      await client.eval(luaScript, 1, reservedKey, estimatedAmount.toString());
    } catch (err: any) {
      this.logger.warn(`Failed to release reservation in Redis: ${err.message}`);
    }
  }

  /**
   * Generic key-value cache methods for tokens, session data, and analytics
   */
  async getCache(key: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      return await client.get(key);
    } catch (err: any) {
      this.logger.warn(`Redis getCache failed for ${key}: ${err.message}`);
      return null;
    }
  }

  async setCache(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, value, 'EX', ttlSeconds);
      } else {
        await client.set(key, value);
      }
    } catch (err: any) {
      this.logger.warn(`Redis setCache failed for ${key}: ${err.message}`);
    }
  }

  async delCache(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.del(key);
    } catch (err: any) {
      this.logger.warn(`Redis delCache failed for ${key}: ${err.message}`);
    }
  }

  private getSpendKey(projectId: string): string {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `spendguard:spend:${projectId}:${monthKey}`;
  }

  private getReservedKey(projectId: string): string {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `spendguard:reserved:${projectId}:${monthKey}`;
  }
}
