import { Injectable } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';
import { resolveProviderKey } from './provider-key.util';
import { postProviderJson } from './provider-http';
import { buildOpenAiCompatibleBody, parseOpenAiCompatibleResponse } from './openai-compatible';

/**
 * Groq. Its chat endpoint is OpenAI-compatible, so this mirrors OpenAIAdapter with a different
 * base URL and key format. Same rule as the other adapters: only the project's own key is used
 * (the platform GROQ_API_KEY is a dev-only opt-in behind ALLOW_PLATFORM_PROVIDER_KEY), and a
 * missing key is 400 missing_provider_key before any upstream call.
 *
 * Groq limits are per organization and per model, so its 429 is the tenant key's own limit:
 * it is returned as a 429 upstream_rate_limited (never as a SpendGuard limit).
 */
@Injectable()
export class GroqAdapter implements ProviderAdapter {
  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    const effectiveKey = resolveProviderKey('Groq', decryptedApiKey, 'GROQ_API_KEY', (k) => k.startsWith('gsk_') && !k.includes('demo'));

    const promptEstimate = this.pricingService.estimateTokens(req.messages.map((m) => m.content).join(' '));

    // Overridable for tests and proxies
    const baseUrl = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const data = await postProviderJson({
      providerLabel: 'Groq',
      url: `${baseUrl}/chat/completions`,
      headers: { Authorization: `Bearer ${effectiveKey}` },
      body: buildOpenAiCompatibleBody(req),
      apiKey: effectiveKey,
    });

    return parseOpenAiCompatibleResponse(data, (t) => this.pricingService.estimateTokens(t), promptEstimate);
  }
}
