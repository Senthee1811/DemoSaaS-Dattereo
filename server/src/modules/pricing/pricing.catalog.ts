export type ProviderName = 'OPENAI' | 'ANTHROPIC' | 'GEMINI';

export interface ModelPricingConfig {
  provider: ProviderName;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPrice?: number;
  displayName?: string;
  contextWindow?: number;
  /** 'manual' = maintained table; 'provider_api' = read from a provider price API (none exist today) */
  source?: string;
  priceUpdatedAt?: Date;
  /** 'available' | 'missing' | null: last result of the provider models-list check */
  providerStatus?: string | null;
  providerCheckedAt?: Date | null;
  retiresAt?: Date | null;
}

/**
 * BOOTSTRAP DATA ONLY. The `model_pricing` table is the source of truth: on boot any
 * model here that has no row yet is inserted, and every API/UI reads the table, not this
 * constant. It is also the last-resort fallback when the database is unreachable, since
 * the gateway fails closed on unpriced models.
 *
 * Provider price APIs do not exist, so these are maintained by hand from the providers'
 * published pricing pages (checked 2026-11-20). Availability is verified separately by
 * `npm run sync:model-catalog` and the daily model-catalog-sync job.
 *
 * Known scheduled changes (update the table via POST /api/v1/pricing when they land):
 *  - gemini-3.8-flash / gemini-3.6-flash: $1.50 in / $7.50 out from 2027-01-01
 *  - claude-haiku-5-5: prices below are for prompts up to 100k tokens ($0.50 / $2.50 above)
 *  - gemini-3.1-pro-preview: prices below are for prompts up to 200k tokens
 */
export const PRICING_CATALOG: Record<string, ModelPricingConfig> = {
  // OpenAI
  'gpt-6.2-astra': { provider: 'OPENAI', inputPricePerMillion: 8.0, outputPricePerMillion: 40.0, cachedInputPrice: 0.4, displayName: 'GPT-6.2 Astra', contextWindow: 1050000 },
  'gpt-6.2-sol': { provider: 'OPENAI', inputPricePerMillion: 2.0, outputPricePerMillion: 10.0, cachedInputPrice: 0.1, displayName: 'GPT-6.2 Sol', contextWindow: 1050000 },
  'gpt-6.1-terra': { provider: 'OPENAI', inputPricePerMillion: 1.0, outputPricePerMillion: 5.0, cachedInputPrice: 0.05, displayName: 'GPT-6.1 Terra', contextWindow: 1050000 },
  'gpt-6-luna': { provider: 'OPENAI', inputPricePerMillion: 0.1, outputPricePerMillion: 0.5, cachedInputPrice: 0.01, displayName: 'GPT-6 Luna', contextWindow: 1050000 },
  // Older but still served (alias not deprecated; dated snapshots retire 2027-01-14)
  'gpt-4o': { provider: 'OPENAI', inputPricePerMillion: 2.5, outputPricePerMillion: 10.0, cachedInputPrice: 1.25, displayName: 'GPT-4o', contextWindow: 128000 },
  'gpt-4o-mini': { provider: 'OPENAI', inputPricePerMillion: 0.15, outputPricePerMillion: 0.6, cachedInputPrice: 0.075, displayName: 'GPT-4o Mini', contextWindow: 128000 },

  // Anthropic
  'claude-fable-5-2': { provider: 'ANTHROPIC', inputPricePerMillion: 8.0, outputPricePerMillion: 40.0, cachedInputPrice: 0.2, displayName: 'Claude Fable 5.2', contextWindow: 1000000 },
  'claude-opus-5-5': { provider: 'ANTHROPIC', inputPricePerMillion: 4.0, outputPricePerMillion: 20.0, cachedInputPrice: 0.2, displayName: 'Claude Opus 5.5', contextWindow: 1000000 },
  'claude-sonnet-5-5': { provider: 'ANTHROPIC', inputPricePerMillion: 2.0, outputPricePerMillion: 10.0, cachedInputPrice: 0.1, displayName: 'Claude Sonnet 5.5', contextWindow: 1000000 },
  'claude-haiku-5-5': { provider: 'ANTHROPIC', inputPricePerMillion: 0.1, outputPricePerMillion: 0.5, cachedInputPrice: 0.01, displayName: 'Claude Haiku 5.5', contextWindow: 1000000 },

  // Google Gemini
  'gemini-3.1-pro-preview': { provider: 'GEMINI', inputPricePerMillion: 2.0, outputPricePerMillion: 12.0, displayName: 'Gemini 3.1 Pro (Preview)' },
  'gemini-3.8-flash': { provider: 'GEMINI', inputPricePerMillion: 0.75, outputPricePerMillion: 3.75, cachedInputPrice: 0.075, displayName: 'Gemini 3.8 Flash' },
  'gemini-3.6-flash': { provider: 'GEMINI', inputPricePerMillion: 0.75, outputPricePerMillion: 3.75, cachedInputPrice: 0.075, displayName: 'Gemini 3.6 Flash' },
  'gemini-3.5-flash-lite': { provider: 'GEMINI', inputPricePerMillion: 0.3, outputPricePerMillion: 2.5, displayName: 'Gemini 3.5 Flash-Lite' },
  'gemini-3.1-flash-lite': { provider: 'GEMINI', inputPricePerMillion: 0.25, outputPricePerMillion: 1.5, displayName: 'Gemini 3.1 Flash-Lite' },
};
