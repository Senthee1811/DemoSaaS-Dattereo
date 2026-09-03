import { Injectable } from '@nestjs/common';

export interface ModelPricing {
  provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export const PRICING_CATALOG: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4o': {
    provider: 'OPENAI',
    inputPricePerMillion: 2.50,
    outputPricePerMillion: 10.00
  },
  'gpt-4o-mini': {
    provider: 'OPENAI',
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.60
  },
  'o1': {
    provider: 'OPENAI',
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 60.00
  },
  'o1-mini': {
    provider: 'OPENAI',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 12.00
  },
  'gpt-4-turbo': {
    provider: 'OPENAI',
    inputPricePerMillion: 10.00,
    outputPricePerMillion: 30.00
  },
  'gpt-3.5-turbo': {
    provider: 'OPENAI',
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 1.50
  },

  // Anthropic Models
  'claude-3-5-sonnet-20241022': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00
  },
  'claude-3-5-sonnet': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00
  },
  'claude-3-5-haiku-20241022': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00
  },
  'claude-3-opus-20240229': {
    provider: 'ANTHROPIC',
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00
  },

  // Google Gemini Models
  'gemini-1.5-pro': {
    provider: 'GEMINI',
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00
  },
  'gemini-1.5-flash': {
    provider: 'GEMINI',
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.30
  },
  'gemini-2.0-flash-exp': {
    provider: 'GEMINI',
    inputPricePerMillion: 0.00,
    outputPricePerMillion: 0.00
  }
};

@Injectable()
export class PricingService {
  /**
   * Calculates USD cost estimate for a model inference request
   */
  calculateCost(modelName: string, tokensIn: number, tokensOut: number): number {
    const config = PRICING_CATALOG[modelName] || PRICING_CATALOG['gpt-4o-mini'];
    const inCost = (tokensIn / 1_000_000) * config.inputPricePerMillion;
    const outCost = (tokensOut / 1_000_000) * config.outputPricePerMillion;
    return Number((inCost + outCost).toFixed(6));
  }

  /**
   * Resolves AI Provider for a model name
   */
  resolveProvider(modelName: string): 'OPENAI' | 'ANTHROPIC' | 'GEMINI' {
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
}
