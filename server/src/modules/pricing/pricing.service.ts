import { Injectable, Logger, OnModuleInit, OnModuleDestroy, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { PRICING_CATALOG, ModelPricingConfig, ProviderName } from './pricing.catalog';
import { estimateReservationPromptTokens, estimateTextTokens, outputReserveTokens } from './token-estimator';

export { PRICING_CATALOG, ModelPricingConfig, ProviderName };

/** Redis counter bumped on every successful price write; instances poll it to refresh their cache quickly. */
export const PRICING_VERSION_KEY = 'spendguard:pricing:version';

const PROVIDERS: ProviderName[] = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'GROQ'];

function pricingError(code: string, message: string, status: HttpStatus): HttpException {
  return new HttpException({ error: { message, type: 'pricing_error', code } }, status);
}

export function modelNotPricedError(model: string): HttpException {
  return new HttpException(
    {
      error: {
        message: `Model '${model}' has no price in the SpendGuard pricing catalog, so its cost cannot be governed. Use a priced model or ask a platform admin to add a price for it.`,
        type: 'invalid_request_error',
        code: 'model_not_priced',
      },
    },
    HttpStatus.BAD_REQUEST,
  );
}

/** Cache-related parts of a request's INPUT tokens (all are subsets of the total input). */
export interface CostUsageDetail {
  /** Tokens read from the provider's prompt cache: billed at the model's cachedInputPrice. */
  cachedTokens?: number;
  /** Anthropic cache writes: billed at 1.25x (5-minute TTL) / 2x (1-hour TTL) of the input price. */
  cacheWriteTokens?: { fiveMinute: number; oneHour: number };
}

/** Anthropic's documented cache-write multipliers on the base input price (prompt-caching docs). */
export const ANTHROPIC_CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const ANTHROPIC_CACHE_WRITE_1H_MULTIPLIER = 2.0;

/**
 * USD cost for one request against ONE price row (a snapshot), 6 decimals.
 *
 * `tokensIn` is the TOTAL input (cached and cache-write tokens included) and `tokensOut` the TOTAL
 * billed output (reasoning included). Input is split:
 *   uncached  -> inputPricePerMillion
 *   cached    -> cachedInputPrice, or the full input price when the model has none (never cheaper
 *                than we can prove; over-charging a cached read is safe, under-charging is not)
 *   cache writes -> input price x the documented multiplier (Anthropic only; others report none)
 * Counts are clamped so the parts can never exceed the total.
 */
export function computeCost(config: ModelPricingConfig, tokensIn: number, tokensOut: number, detail: CostUsageDetail = {}): number {
  const total = Math.max(0, tokensIn);
  const cached = Math.min(Math.max(0, detail.cachedTokens ?? 0), total);
  const w5 = Math.min(Math.max(0, detail.cacheWriteTokens?.fiveMinute ?? 0), total - cached);
  const w1 = Math.min(Math.max(0, detail.cacheWriteTokens?.oneHour ?? 0), total - cached - w5);
  const uncached = total - cached - w5 - w1;

  const inRate = config.inputPricePerMillion;
  const cachedRate = config.cachedInputPrice ?? inRate;
  const inCost =
    (uncached / 1_000_000) * inRate +
    (cached / 1_000_000) * cachedRate +
    (w5 / 1_000_000) * inRate * ANTHROPIC_CACHE_WRITE_5M_MULTIPLIER +
    (w1 / 1_000_000) * inRate * ANTHROPIC_CACHE_WRITE_1H_MULTIPLIER;
  const outCost = (Math.max(0, tokensOut) / 1_000_000) * config.outputPricePerMillion;
  return Number((inCost + outCost).toFixed(6));
}

/**
 * Worst-case USD for one request against ONE price row: the input estimate plus every output token
 * the request is allowed to produce. Pure, so the gateway can size the hold from the SAME snapshot it
 * settles with. Assumes NO caching (a cached read is cheaper, so the hold can only be too high).
 */
export function computeMaxCost(config: ModelPricingConfig, promptTokens: number, maxOutputTokens: number): number {
  const inputCost = (Math.max(0, promptTokens) / 1_000_000) * config.inputPricePerMillion;
  const outputCost = (Math.max(0, maxOutputTokens) / 1_000_000) * config.outputPricePerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

@Injectable()
export class PricingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricingService.name);
  private memoryCache: Map<string, ModelPricingConfig> = new Map();
  private syncTimer: NodeJS.Timeout | null = null;
  private syncTicks = 0;
  private lastSeenVersion: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    // Populate default memory cache from catalog
    for (const [model, config] of Object.entries(PRICING_CATALOG)) {
      this.memoryCache.set(model, config);
    }
  }

  async onModuleInit() {
    await this.seedMissingCatalogRows();
    await this.refreshPricingFromDb();
    this.startSync();
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  // ── Cross-instance consistency ───────────────────────────────────────────
  // Prices live in Postgres; each instance caches them. A price write bumps a Redis version counter
  // and every instance polls it (default every 5 s) and reloads from Postgres when it changed. If
  // Redis is down or the bump was lost, a full reload still happens about once a minute. So after
  // a write, instances converge within ~5 s normally and ~60 s in the worst case. A request already
  // in flight keeps the price snapshot it started with.

  private startSync() {
    if (this.syncTimer || process.env.PRICING_SYNC_DISABLED === 'true') return;
    const everyMs = Number(process.env.PRICING_SYNC_INTERVAL_MS) || 5000;
    this.syncTimer = setInterval(() => {
      this.syncPricingOnce().catch((err) => this.logger.warn(`Pricing sync failed: ${err?.message}`));
    }, everyMs);
    this.syncTimer.unref();
  }

  /** One sync tick. Public so it can be driven directly in tests. */
  async syncPricingOnce(forceEvery = 12): Promise<'refreshed' | 'unchanged'> {
    this.syncTicks++;
    const version = await this.redisService.getCache(PRICING_VERSION_KEY); // null when Redis is down or never bumped
    const changed = version !== null && version !== this.lastSeenVersion;
    const forced = this.syncTicks % forceEvery === 0;
    if (!changed && !forced) return 'unchanged';
    await this.refreshPricingFromDb();
    if (version !== null) this.lastSeenVersion = version;
    return 'refreshed';
  }

  /**
   * Inserts catalog models that have no row yet (never touches existing rows, so admin
   * price edits and deactivations survive restarts).
   */
  async seedMissingCatalogRows(): Promise<number> {
    try {
      const res = await (this.prisma as any).modelPricing?.createMany({
        data: Object.entries(PRICING_CATALOG).map(([model, c]) => ({
          model,
          provider: c.provider,
          displayName: c.displayName,
          inputPricePerMillion: c.inputPricePerMillion,
          outputPricePerMillion: c.outputPricePerMillion,
          cachedInputPrice: c.cachedInputPrice,
          contextWindow: c.contextWindow,
          source: 'manual',
        })),
        skipDuplicates: true,
      });
      return res?.count ?? 0;
    } catch (err: any) {
      this.logger.warn(`Could not seed model pricing rows: ${err.message}`);
      return 0;
    }
  }

  private rowToConfig(item: any): ModelPricingConfig {
    return {
      provider: item.provider as ProviderName,
      inputPricePerMillion: Number(item.inputPricePerMillion),
      outputPricePerMillion: Number(item.outputPricePerMillion),
      cachedInputPrice: item.cachedInputPrice != null ? Number(item.cachedInputPrice) : undefined,
      displayName: item.displayName || undefined,
      contextWindow: item.contextWindow || undefined,
      source: item.source,
      priceUpdatedAt: item.priceUpdatedAt,
      providerStatus: item.providerStatus ?? null,
      providerCheckedAt: item.providerCheckedAt ?? null,
      retiresAt: item.retiresAt ?? null,
      rowUpdatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
    };
  }

  /** True when `incoming` was written no later than what is cached (so it must not replace it). */
  private isStale(incoming: ModelPricingConfig, cached: ModelPricingConfig | undefined): boolean {
    return !!(cached?.rowUpdatedAt && incoming.rowUpdatedAt && incoming.rowUpdatedAt.getTime() < cached.rowUpdatedAt.getTime());
  }

  /**
   * Reloads the in-memory price cache from the active rows of `model_pricing`.
   * The table wins: models deactivated or removed there stop being priced here too.
   * If the table is empty/unreachable the cache is left exactly as it was (the built-in catalog is the
   * fallback only at boot), so a failed reload can never remove valid prices.
   *
   * Race-safe against a concurrent price write on this instance: an entry that is NEWER than the
   * rows just read (it was written while the query was in flight) is kept instead of being clobbered.
   */
  async refreshPricingFromDb(): Promise<void> {
    try {
      const startedAt = new Date();
      const dbPrices = await (this.prisma as any).modelPricing?.findMany({
        where: { isActive: true },
      });

      if (dbPrices && dbPrices.length > 0) {
        const next = new Map<string, ModelPricingConfig>();
        for (const item of dbPrices) {
          const incoming = this.rowToConfig(item);
          const cached = this.memoryCache.get(item.model);
          next.set(item.model, this.isStale(incoming, cached) ? (cached as ModelPricingConfig) : incoming);
        }
        // A row written after this query began is not in `dbPrices`: do not drop it
        for (const [model, cached] of this.memoryCache) {
          if (!next.has(model) && cached.rowUpdatedAt && cached.rowUpdatedAt.getTime() >= startedAt.getTime()) next.set(model, cached);
        }
        this.memoryCache = next;
        this.logger.log(`Loaded ${dbPrices.length} model pricing entries from database`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync pricing from DB (keeping current prices): ${err.message}`);
    }
  }

  /**
   * Price for a model from the DB pricing table (cached) or the built-in catalog.
   * Returns undefined for unknown models — there is deliberately no default rate.
   */
  getModelPrice(modelName: string): ModelPricingConfig | undefined {
    return this.memoryCache.get(modelName);
  }

  isModelPriced(modelName: string): boolean {
    return this.getModelPrice(modelName) !== undefined;
  }

  /** Price or throw 400 model_not_priced. Never bill an unknown model at another model's rate. */
  private requirePrice(modelName: string): ModelPricingConfig {
    const config = this.getModelPrice(modelName);
    if (!config) throw modelNotPricedError(modelName);
    return config;
  }

  /**
   * Calculates USD cost estimate for a model inference request (6 decimal precision).
   * Throws 400 model_not_priced for models with no price.
   */
  calculateCost(modelName: string, tokensIn: number, tokensOut: number, detail: CostUsageDetail = {}): number {
    return computeCost(this.requirePrice(modelName), tokensIn, tokensOut, detail);
  }

  /**
   * The price row for a model, or a 400 model_not_priced. The gateway snapshots it BEFORE the
   * upstream call so the reservation and the settlement use the same price even if an admin
   * edits or deactivates the model while the request is in flight.
   */
  requireModelPrice(modelName: string): ModelPricingConfig {
    return this.requirePrice(modelName);
  }

  /**
   * Resolves AI Provider for a model name
   */
  resolveProvider(modelName: string): 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ' {
    const config = this.memoryCache.get(modelName);
    if (config) return config.provider;

    if (modelName.startsWith('claude')) return 'ANTHROPIC';
    if (modelName.startsWith('gemini')) return 'GEMINI';
    // Groq hosts open models under their own IDs ('llama-...', 'openai/gpt-oss-...', 'qwen/...').
    // Priced ones are resolved from the catalog above; this only covers a model not in it yet.
    if (/^(llama-|meta-llama\/|openai\/|qwen\/|moonshotai\/|groq\/)/.test(modelName)) return 'GROQ';
    return 'OPENAI';
  }

  /**
   * Conservative token estimate for text (see token-estimator.ts for the measurements behind it).
   * Also the fallback when a provider returns no usage block, where leaning high is the safe side.
   */
  estimateTokens(text: string): number {
    return estimateTextTokens(text);
  }

  /**
   * Prompt tokens used to SIZE a reservation: class-aware estimate x the provider's margin.
   * Not billing: settlement uses provider-reported usage.
   */
  estimateReservationTokens(provider: ProviderName, messages: Array<{ content: string }>): number {
    return estimateReservationPromptTokens(provider, messages);
  }

  /** Output tokens to reserve for a request: max_tokens plus any configured provider-specific reserve. */
  reservedOutputTokens(provider: ProviderName, maxTokens: number): number {
    return maxTokens + outputReserveTokens(provider);
  }

  /**
   * Estimate maximum potential cost for pre-flight budget reservation.
   * Assumes completion may generate up to maxTokens.
   */
  estimateMaxCost(model: string, promptTokens: number, maxTokens = 1000): number {
    return computeMaxCost(this.requirePrice(model), promptTokens, maxTokens);
  }

  /** Snapshot of the in-memory price cache (mirrors the active DB rows). */
  getAllPrices() {
    return [...this.memoryCache.entries()].map(([model, c]) => this.toPublic(model, c));
  }

  private toPublic(model: string, c: ModelPricingConfig) {
    return {
      model,
      provider: c.provider,
      displayName: c.displayName || model,
      inputPricePerMillion: c.inputPricePerMillion,
      outputPricePerMillion: c.outputPricePerMillion,
      cachedInputPrice: c.cachedInputPrice ?? null,
      contextWindow: c.contextWindow ?? null,
      source: c.source ?? 'builtin_fallback',
      // When the PRICE last changed, not when a sync last looked at the row
      updatedAt: c.priceUpdatedAt ?? null,
      providerStatus: c.providerStatus ?? null,
      providerCheckedAt: c.providerCheckedAt ?? null,
      retiresAt: c.retiresAt ?? null,
    };
  }

  /**
   * What GET /api/v1/pricing serves: the active rows of `model_pricing`, read from the
   * database (not from a constant). Falls back to the in-memory cache only if the DB is down.
   */
  async listPrices() {
    let models: ReturnType<PricingService['toPublic']>[];
    try {
      const rows = await (this.prisma as any).modelPricing.findMany({
        where: { isActive: true },
        orderBy: [{ provider: 'asc' }, { model: 'asc' }],
      });
      models = rows.map((r: any) => this.toPublic(r.model, this.rowToConfig(r)));
    } catch (err: any) {
      this.logger.warn(`listPrices: DB unavailable, serving cached prices: ${err.message}`);
      models = this.getAllPrices();
    }
    const latest = (key: 'updatedAt' | 'providerCheckedAt') => {
      const ts = models
        .map((m) => m[key])
        .filter(Boolean)
        .map((d) => new Date(d as Date).getTime());
      return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
    };
    return {
      models,
      meta: {
        // Latest price change across the table; the UI shows "Pricing as of ..."
        pricingUpdatedAt: latest('updatedAt'),
        lastAvailabilityCheckAt: latest('providerCheckedAt'),
        // Honest labelling: providers publish no price API, so prices are a maintained table
        priceSource: 'maintained table (provider pricing pages), not a live feed',
      },
    };
  }

  /** Validates an admin price write. Returns a clean DTO or throws 400. */
  private validatePriceInput(dto: any) {
    const bad = (msg: string) => pricingError('invalid_price', msg, HttpStatus.BAD_REQUEST);
    if (!dto || typeof dto !== 'object') throw bad('A pricing body is required.');
    if (typeof dto.model !== 'string' || !dto.model.trim() || dto.model.length > 200) throw bad('model must be a non-empty string of at most 200 characters.');
    if (!PROVIDERS.includes(dto.provider)) throw bad(`provider must be one of ${PROVIDERS.join(', ')}.`);
    // Decimal(10,4) in the table: finite, non-negative, below 10^6 per million tokens
    const rate = (v: unknown, name: string, required: boolean) => {
      if (v === undefined || v === null) {
        if (required) throw bad(`${name} is required.`);
        return undefined;
      }
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 1_000_000) throw bad(`${name} must be a finite number between 0 and 999999 (USD per million tokens).`);
      return Number(v.toFixed(4));
    };
    const input = rate(dto.inputPricePerMillion, 'inputPricePerMillion', true) as number;
    const output = rate(dto.outputPricePerMillion, 'outputPricePerMillion', true) as number;
    const cached = rate(dto.cachedInputPrice, 'cachedInputPrice', false);
    if (cached !== undefined && cached > input) throw bad('cachedInputPrice cannot be higher than inputPricePerMillion.');
    if (dto.contextWindow !== undefined && (!Number.isInteger(dto.contextWindow) || dto.contextWindow <= 0)) throw bad('contextWindow must be a positive integer.');
    if (dto.displayName !== undefined && (typeof dto.displayName !== 'string' || dto.displayName.length > 200)) throw bad('displayName must be a string of at most 200 characters.');
    return {
      model: dto.model.trim(),
      provider: dto.provider as ProviderName,
      inputPricePerMillion: input,
      outputPricePerMillion: output,
      cachedInputPrice: cached,
      displayName: dto.displayName as string | undefined,
      contextWindow: dto.contextWindow as number | undefined,
    };
  }

  /**
   * Upsert a model price (FR4: live configurable rates).
   *
   * The database is the source of truth and is written FIRST. If that write fails nothing changes:
   * the call throws 503 `pricing_persist_failed`, the previous price stays active in memory, and no
   * success is reported. (It used to swallow the error, update only this instance's memory and
   * return the input as if it had been saved: the other instances kept the old price and a restart
   * silently reverted it.)
   *
   * On success the cache is set from the row the database returned, only if it is not older than
   * what is cached (two concurrent writes cannot leave memory disagreeing with the table), and the
   * version counter is bumped so the other instances reload within seconds.
   */
  async upsertModelPrice(input: {
    model: string;
    provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ';
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    cachedInputPrice?: number;
    displayName?: string;
    contextWindow?: number;
  }) {
    const dto = this.validatePriceInput(input);

    let row: any;
    try {
      row = await (this.prisma as any).modelPricing.upsert({
        where: { model: dto.model },
        update: {
          provider: dto.provider,
          inputPricePerMillion: dto.inputPricePerMillion,
          outputPricePerMillion: dto.outputPricePerMillion,
          ...(dto.cachedInputPrice !== undefined ? { cachedInputPrice: dto.cachedInputPrice } : {}),
          displayName: dto.displayName,
          contextWindow: dto.contextWindow,
          isActive: true,
          source: 'manual',
          priceUpdatedAt: new Date(),
        },
        create: {
          model: dto.model,
          provider: dto.provider,
          inputPricePerMillion: dto.inputPricePerMillion,
          outputPricePerMillion: dto.outputPricePerMillion,
          cachedInputPrice: dto.cachedInputPrice,
          displayName: dto.displayName,
          contextWindow: dto.contextWindow,
          isActive: true,
        },
      });
    } catch (err: any) {
      this.logger.error(`Price update for ${dto.model} was NOT saved: ${err?.code ?? err?.name}`);
      throw pricingError(
        'pricing_persist_failed',
        `The price for ${dto.model} could not be saved, so it was NOT changed. The previous price remains in effect.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!row) {
      throw pricingError('pricing_persist_failed', `The price for ${dto.model} could not be saved, so it was NOT changed.`, HttpStatus.SERVICE_UNAVAILABLE);
    }

    const incoming = this.rowToConfig(row);
    if (!this.isStale(incoming, this.memoryCache.get(dto.model))) {
      const next = new Map(this.memoryCache);
      next.set(dto.model, incoming);
      this.memoryCache = next;
    }

    // Tell the other instances. Best effort: if Redis is down they still reload on the periodic full sync.
    try {
      await this.redisService.incrCache(PRICING_VERSION_KEY);
    } catch (err: any) {
      // The price is already committed: a failed notification must not report the write as failed
      this.logger.warn(`Could not publish the pricing version (other instances reload within ~60s): ${err?.message}`);
    }
    return row;
  }
}
