import { Injectable, Logger, OnModuleInit, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { PRICING_CATALOG, ModelPricingConfig, ProviderName } from './pricing.catalog';

export { PRICING_CATALOG, ModelPricingConfig, ProviderName };

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

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private memoryCache: Map<string, ModelPricingConfig> = new Map();

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
    };
  }

  /**
   * Replaces the in-memory price cache with the active rows of `model_pricing`.
   * The table wins: models deactivated or removed there stop being priced here too.
   * If the table is empty/unreachable the built-in catalog stays as the fallback.
   */
  async refreshPricingFromDb(): Promise<void> {
    try {
      const dbPrices = await (this.prisma as any).modelPricing?.findMany({
        where: { isActive: true },
      });

      if (dbPrices && dbPrices.length > 0) {
        const next = new Map<string, ModelPricingConfig>();
        for (const item of dbPrices) next.set(item.model, this.rowToConfig(item));
        this.memoryCache = next;
        this.logger.log(`Loaded ${dbPrices.length} model pricing entries from database`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync pricing from DB (using built-in catalog): ${err.message}`);
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
  calculateCost(modelName: string, tokensIn: number, tokensOut: number): number {
    const config = this.requirePrice(modelName);
    const inCost = (tokensIn / 1_000_000) * config.inputPricePerMillion;
    const outCost = (tokensOut / 1_000_000) * config.outputPricePerMillion;
    return Number((inCost + outCost).toFixed(6));
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
   * Estimates token count based on string length (heuristic ~4 chars per token)
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * Estimate maximum potential cost for pre-flight budget reservation.
   * Assumes completion may generate up to maxTokens.
   */
  estimateMaxCost(model: string, promptTokens: number, maxTokens = 1000): number {
    const config = this.requirePrice(model);
    const inputCost = (promptTokens / 1_000_000) * config.inputPricePerMillion;
    const maxOutputCost = (maxTokens / 1_000_000) * config.outputPricePerMillion;
    return Number((inputCost + maxOutputCost).toFixed(6));
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

  /**
   * Upsert a model pricing entry in DB and refresh cache (FR4: live configurable rates)
   */
  async upsertModelPrice(dto: {
    model: string;
    provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ';
    inputPricePerMillion: number;
    outputPricePerMillion: number;
    displayName?: string;
    contextWindow?: number;
  }) {
    try {
      const result = await (this.prisma as any).modelPricing?.upsert({
        where: { model: dto.model },
        update: {
          provider: dto.provider,
          inputPricePerMillion: dto.inputPricePerMillion,
          outputPricePerMillion: dto.outputPricePerMillion,
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
          displayName: dto.displayName,
          contextWindow: dto.contextWindow,
          isActive: true,
        },
      });

      this.memoryCache.set(dto.model, {
        provider: dto.provider,
        inputPricePerMillion: dto.inputPricePerMillion,
        outputPricePerMillion: dto.outputPricePerMillion,
        displayName: dto.displayName,
        contextWindow: dto.contextWindow,
      });

      return result;
    } catch (err: any) {
      // If DB update fails, still update in-memory
      this.memoryCache.set(dto.model, {
        provider: dto.provider,
        inputPricePerMillion: dto.inputPricePerMillion,
        outputPricePerMillion: dto.outputPricePerMillion,
        displayName: dto.displayName,
        contextWindow: dto.contextWindow,
      });
      return { ...dto };
    }
  }
}
