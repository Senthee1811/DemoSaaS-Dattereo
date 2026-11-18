import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { utcMonthKey, utcNextMonthStart, ttlUntil } from '@/common/billing-period';
import {
  BudgetBucket,
  HoldReservation,
  FINALIZED_MARKER_TTL_SEC,
  budgetHoldTtlMs,
  RESERVE_HOLD_LUA,
  SETTLE_HOLD_LUA,
  RELEASE_HOLD_LUA,
  PRUNE_HOLDS_LUA,
  RECONCILE_SPEND_LUA,
  LEDGER_PENDING_TTL_MS,
} from './budget-holds.lua';

export type { BudgetBucket, HoldReservation } from './budget-holds.lua';

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

      // TTL: end of the current UTC month + 1 day buffer
      await client.expire(key, ttlUntil(utcNextMonthStart()));
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

      await client.expire(key, ttlUntil(utcNextMonthStart()));
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

  // ───────────────────────────────────────────────────────────────────────────
  // Per-request budget holds
  //
  // A "bucket" is one spend counter with its own cap (project/month today; item 7
  // adds key/month and project/week). Each bucket stores its holds individually:
  //   <holdsKey>     HASH  requestId -> held amount (USD)
  //   <holdsExpKey>  ZSET  requestId -> expiry (epoch ms)
  // so a hold leaked by a crash expires on its own schedule instead of sharing
  // one TTL that every new request resets.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Atomically, for every bucket: drop expired holds, then check
   * spend + active holds + amount <= cap. If every bucket fits, record the hold
   * in all of them; otherwise record nothing and report the first bucket that
   * failed. Re-reserving an ID that already holds is a no-op ('duplicate').
   * Returns null when Redis is unavailable (caller must fail closed).
   */
  async reserveHold(
    requestId: string,
    amount: number,
    buckets: BudgetBucket[],
    holdTtlMs = budgetHoldTtlMs(),
  ): Promise<HoldReservation | null> {
    const client = this.getClient();
    if (!client) return null;

    const keys = buckets.flatMap((b) => [b.spendKey, b.holdsKey, b.holdsExpKey]);
    const args = [
      requestId,
      String(amount),
      String(Math.max(1, Math.floor(holdTtlMs))),
      ...buckets.flatMap((b) => [String(b.cap ?? -1), String(b.keyTtlSec)]),
    ];

    try {
      const res: any = await client.eval(RESERVE_HOLD_LUA, keys.length, ...keys, ...args);
      const code = Number(res[0]);
      return {
        status: code === 1 ? 'reserved' : code === 2 ? 'duplicate' : 'rejected',
        failedBucket: code === 0 ? buckets[Number(res[1]) - 1] : undefined,
        spend: parseFloat(res[2]),
        held: parseFloat(res[3]),
      };
    } catch (err: any) {
      this.logger.error(`Atomic budget hold failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Settle a hold with the verified actual cost: removes the hold from every
   * bucket and adds `actualCost` to every bucket's spend. Idempotent per
   * request ID — only the first settle/release for an ID has any effect.
   * Returns null when Redis is unavailable.
   */
  async settleHold(
    requestId: string,
    actualCost: number,
    buckets: BudgetBucket[],
  ): Promise<{ applied: boolean; spend: number } | null> {
    const client = this.getClient();
    if (!client) return null;

    const keys = [this.finalizedKey(requestId), ...buckets.flatMap((b) => [b.spendKey, b.holdsKey, b.holdsExpKey])];
    const args = [requestId, String(actualCost), String(FINALIZED_MARKER_TTL_SEC), ...buckets.map((b) => String(b.keyTtlSec))];

    try {
      const res: any = await client.eval(SETTLE_HOLD_LUA, keys.length, ...keys, ...args);
      return { applied: Number(res[0]) === 1, spend: parseFloat(res[1]) };
    } catch (err: any) {
      this.logger.error(`Budget hold settlement failed for ${requestId}: ${err.message}`);
      return null;
    }
  }

  /** Release a hold without charging (upstream failure). Idempotent per request ID. */
  async releaseHold(requestId: string, buckets: BudgetBucket[]): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    const keys = [this.finalizedKey(requestId), ...buckets.flatMap((b) => [b.holdsKey, b.holdsExpKey])];
    try {
      await client.eval(RELEASE_HOLD_LUA, keys.length, ...keys, requestId, String(FINALIZED_MARKER_TTL_SEC));
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to release budget hold ${requestId}: ${err.message}`);
      return false;
    }
  }

  /** Remove expired holds from a bucket and return how many active holds remain (null if Redis is down). */
  async pruneExpiredHolds(bucket: BudgetBucket): Promise<number | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      const res: any = await client.eval(PRUNE_HOLDS_LUA, 2, bucket.holdsKey, bucket.holdsExpKey);
      return Number(res);
    } catch (err: any) {
      this.logger.warn(`Failed to prune expired holds: ${err.message}`);
      return null;
    }
  }

  /** Bucket for a project's monthly spend. */
  projectMonthBucket(projectId: string, cap: number | null, at = new Date()): BudgetBucket {
    const month = this.monthKey(at);
    return {
      name: 'project_monthly',
      spendKey: `spendguard:spend:${projectId}:${month}`,
      holdsKey: `spendguard:holds:${projectId}:${month}`,
      holdsExpKey: `spendguard:holds-exp:${projectId}:${month}`,
      cap,
      keyTtlSec: this.monthTtlSec(at),
    };
  }

  // ── Ledger persistence tracking (settled in Redis, row not yet in Postgres) ──

  /** Mark a request as settled-but-not-persisted. Call BEFORE settling the hold. */
  async markPendingPersist(projectId: string, requestId: string, at: Date): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const { pendingKey, seqKey, ttl } = this.ledgerKeys(projectId, at);
    try {
      const nowMs = Date.now();
      await client
        .multi()
        .zadd(pendingKey, nowMs + LEDGER_PENDING_TTL_MS, requestId)
        .incr(seqKey)
        .expire(pendingKey, ttl)
        .expire(seqKey, ttl)
        .exec();
    } catch (err: any) {
      this.logger.warn(`Failed to mark request ${requestId} pending persist: ${err.message}`);
    }
  }

  /** The request's ledger row is in Postgres. */
  async clearPendingPersist(projectId: string, requestId: string, at: Date): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const { pendingKey, seqKey } = this.ledgerKeys(projectId, at);
    try {
      await client.multi().zrem(pendingKey, requestId).incr(seqKey).exec();
    } catch (err: any) {
      this.logger.warn(`Failed to clear pending persist for ${requestId}: ${err.message}`);
    }
  }

  /** Ledger activity counter; read it BEFORE aggregating the DB and pass it to reconcileProjectSpend. */
  async getLedgerSeq(projectId: string, at: Date): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;
    try {
      return (await client.get(this.ledgerKeys(projectId, at).seqKey)) ?? '0';
    } catch {
      return null;
    }
  }

  /** See RECONCILE_SPEND_LUA. Returns null if Redis is unavailable. */
  async reconcileProjectSpend(
    projectId: string,
    dbSum: number,
    seqBeforeDbRead: string,
    at: Date,
  ): Promise<{ spend: number; lowered: boolean } | null> {
    const client = this.getClient();
    if (!client) return null;
    const bucket = this.projectMonthBucket(projectId, null, at);
    const { pendingKey, seqKey } = this.ledgerKeys(projectId, at);
    try {
      const res: any = await client.eval(
        RECONCILE_SPEND_LUA,
        5,
        bucket.spendKey,
        bucket.holdsKey,
        bucket.holdsExpKey,
        pendingKey,
        seqKey,
        String(dbSum),
        seqBeforeDbRead,
        String(bucket.keyTtlSec),
      );
      return { spend: parseFloat(res[0]), lowered: Number(res[1]) === 1 };
    } catch (err: any) {
      this.logger.warn(`Spend reconciliation failed for project ${projectId}: ${err.message}`);
      return null;
    }
  }

  private ledgerKeys(projectId: string, at: Date) {
    const month = this.monthKey(at);
    return {
      pendingKey: `spendguard:ledger-pending:${projectId}:${month}`,
      seqKey: `spendguard:ledger-seq:${projectId}:${month}`,
      ttl: this.monthTtlSec(at),
    };
  }

  private finalizedKey(requestId: string): string {
    return `spendguard:hold-final:${requestId}`;
  }

  private monthKey(at: Date): string {
    return utcMonthKey(at);
  }

  /** Seconds until the end of the UTC month plus a one-day buffer. */
  private monthTtlSec(at: Date): number {
    return ttlUntil(utcNextMonthStart(at), at);
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
    return this.projectMonthBucket(projectId, null).spendKey;
  }
}
