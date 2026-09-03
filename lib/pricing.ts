import { ModelPricing, Provider } from './types';

export const MODEL_PRICING_CATALOG: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o': {
    provider: 'OPENAI',
    model: 'gpt-4o',
    displayName: 'OpenAI GPT-4o',
    inputPer1k: 0.0025,
    outputPer1k: 0.0100,
    contextWindow: 128000,
  },
  'gpt-4o-mini': {
    provider: 'OPENAI',
    model: 'gpt-4o-mini',
    displayName: 'OpenAI GPT-4o mini',
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
    contextWindow: 128000,
  },
  'o1': {
    provider: 'OPENAI',
    model: 'o1',
    displayName: 'OpenAI o1 Reasoning',
    inputPer1k: 0.0150,
    outputPer1k: 0.0600,
    contextWindow: 200000,
  },
  'o3-mini': {
    provider: 'OPENAI',
    model: 'o3-mini',
    displayName: 'OpenAI o3-mini',
    inputPer1k: 0.0011,
    outputPer1k: 0.0044,
    contextWindow: 200000,
  },
  // Anthropic Claude Models
  'claude-3-5-sonnet-20241022': {
    provider: 'CLAUDE',
    model: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    inputPer1k: 0.0030,
    outputPer1k: 0.0150,
    contextWindow: 200000,
  },
  'claude-3-5-haiku-20241022': {
    provider: 'CLAUDE',
    model: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    inputPer1k: 0.0008,
    outputPer1k: 0.0040,
    contextWindow: 200000,
  },
  'claude-3-opus-20240229': {
    provider: 'CLAUDE',
    model: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    inputPer1k: 0.0150,
    outputPer1k: 0.0750,
    contextWindow: 200000,
  },
  // Google Gemini Models
  'gemini-1.5-pro': {
    provider: 'GEMINI',
    model: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    inputPer1k: 0.00125,
    outputPer1k: 0.0050,
    contextWindow: 2000000,
  },
  'gemini-1.5-flash': {
    provider: 'GEMINI',
    model: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    inputPer1k: 0.000075,
    outputPer1k: 0.0003,
    contextWindow: 1000000,
  },
  'gemini-2.0-flash': {
    provider: 'GEMINI',
    model: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    inputPer1k: 0.00010,
    outputPer1k: 0.0004,
    contextWindow: 1000000,
  }
};

/**
 * Calculates exact cost in USD given model and token counts
 */
export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = MODEL_PRICING_CATALOG[model] || {
    provider: 'OPENAI' as Provider,
    model,
    displayName: model,
    inputPer1k: 0.0015,
    outputPer1k: 0.0050,
    contextWindow: 128000,
  };

  const costIn = (tokensIn / 1000) * pricing.inputPer1k;
  const costOut = (tokensOut / 1000) * pricing.outputPer1k;
  const total = costIn + costOut;
  
  // Return rounded to 6 decimal places
  return Math.round(total * 1000000) / 1000000;
}

/**
 * Fast estimation of token count from text string (~4 chars per token)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.trim().length / 3.8);
}
