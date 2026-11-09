import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

export interface ModelPricingConfig {
  provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPrice?: number;
  displayName?: string;
  contextWindow?: number;
}

export const PRICING_CATALOG: Record<string, ModelPricingConfig> = {
  // OpenAI Models
  'gpt-4o': {
    provider: 'OPENAI',
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00,
    displayName: 'GPT-4o (Omni)',
    contextWindow: 128000,
  },
  'gpt-4o-mini': {
    provider: 'OPENAI',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60,
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
  },
  'o1': {
    provider: 'OPENAI',
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 60.00,
    displayName: 'o1 (Reasoning)',
    contextWindow: 200000,
  },
  'o1-mini': {
    provider: 'OPENAI',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 12.00,
    displayName: 'o1 Mini',
    contextWindow: 128000,
  },
  'gpt-4-turbo': {
    provider: 'OPENAI',
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00,
    displayName: 'GPT-4 Turbo',
    contextWindow: 128000,
  },
  'gpt-3.5-turbo': {
    provider: 'OPENAI',
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 1.50,
    displayName: 'GPT-3.5 Turbo',
    contextWindow: 16385,
  },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    displayName: 'Claude 3.5 Sonnet (v2)',
    contextWindow: 200000,
  },
  'claude-3-5-sonnet': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
    displayName: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
  },
  'claude-3-5-haiku-20241022': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
    displayName: 'Claude 3.5 Haiku',
    contextWindow: 200000,
  },
  'claude-3-opus-20240229': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
    displayName: 'Claude 3 Opus',
    contextWindow: 200000,
  },

  // Google Gemini Models
  'gemini-1.5-pro': {
    provider: 'GEMINI',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
    displayName: 'Gemini 1.5 Pro',
    contextWindow: 2000000,
  },
  'gemini-1.5-flash': {
    provider: 'GEMINI',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.30,
    displayName: 'Gemini 1.5 Flash',
    contextWindow: 1000000,
  },
  'gemini-2.0-flash-exp': {
    provider: 'GEMINI',
    inputPricePerMillion: 0.00,
    outputPricePerMillion: 0.00,
    displayName: 'Gemini 2.0 Flash (Exp)',
    contextWindow: 1000000,
  },
};

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
    await this.refreshPricingFromDb();
  }

  /**
   * Refreshes model pricing from the database into local memory cache
   */
  async refreshPricingFromDb(): Promise<void> {
    try {
      // Check if Prisma is available
      const dbPrices = await (this.prisma as any).modelPricing?.findMany({
        where: { isActive: true },
      });

      if (dbPrices && dbPrices.length > 0) {
        for (const item of dbPrices) {
          this.memoryCache.set(item.model, {
            provider: item.provider as any,
            inputPricePerMillion: Number(item.inputPricePerMillion),
            outputPricePerMillion: Number(item.outputPricePerMillion),
            cachedInputPrice: item.cachedInputPrice ? Number(item.cachedInputPrice) : undefined,
            displayName: item.displayName || undefined,
            contextWindow: item.contextWindow || undefined,
          });
        }
        this.logger.log(`Loaded ${dbPrices.length} dynamic model pricing entries from database`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not sync pricing from DB (using built-in catalog): ${err.message}`);
    }
  }

  /**
   * Calculates USD cost estimate for a model inference request.
   * Guarantees 6 decimal precision and handles unpriced models with graceful default.
   */
  calculateCost(modelName: string, tokensIn: number, tokensOut: number): number {
    const config = this.memoryCache.get(modelName) || PRICING_CATALOG[modelName] || PRICING_CATALOG['gpt-4o-mini'];
    const inCost = (tokensIn / 1_000_000) * config.inputPricePerMillion;
    const outCost = (tokensOut / 1_000_000) * config.outputPricePerMillion;
    return Number((inCost + outCost).toFixed(6));
  }

  /**
   * Resolves AI Provider for a model name
   */
  resolveProvider(modelName: string): 'OPENAI' | 'ANTHROPIC' | 'GEMINI' {
    const config = this.memoryCache.get(modelName);
    if (config) return config.provider;

    if (modelName.startsWith('claude')) return 'ANTHROPIC';
    if (modelName.startsWith('gemini')) return 'GEMINI';
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
   * Returns list of all current model pricing configurations
   */
  getAllPrices(): { model: string; provider: string; inputPricePerMillion: number; outputPricePerMillion: number; displayName?: string }[] {
    const list: any[] = [];
    for (const [model, config] of this.memoryCache.entries()) {
      list.push({
        model,
        provider: config.provider,
        inputPricePerMillion: config.inputPricePerMillion,
        outputPricePerMillion: config.outputPricePerMillion,
        displayName: config.displayName || model,
      });
    }
    return list;
  }

  /**
   * Upsert a model pricing entry in DB and refresh cache (FR4: live configurable rates)
   */
  async upsertModelPrice(dto: {
    model: string;
    provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
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
