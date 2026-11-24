import { Injectable } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';
import { resolveProviderKey } from './provider-key.util';
import { postProviderJson } from './provider-http';
import { buildOpenAiCompatibleBody, parseOpenAiCompatibleResponse } from './openai-compatible';

@Injectable()
export class OpenAIAdapter implements ProviderAdapter {
  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    // Only the project's own key. The platform env key is a dev-only opt-in
    // (ALLOW_PLATFORM_PROVIDER_KEY=true and NODE_ENV !== 'production').
    const effectiveKey = resolveProviderKey('OpenAI', decryptedApiKey, 'OPENAI_API_KEY', (k) => k.startsWith('sk-') && !k.includes('demo'));

    const promptEstimate = this.pricingService.estimateTokens(req.messages.map((m) => m.content).join(' '));

    // Overridable for OpenAI-compatible endpoints (Azure OpenAI proxies, self-hosted gateways, tests)
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const data = await postProviderJson({
      providerLabel: 'OpenAI',
      url: `${baseUrl}/chat/completions`,
      headers: { Authorization: `Bearer ${effectiveKey}` },
      body: buildOpenAiCompatibleBody(req, { forOpenAi: true }),
      apiKey: effectiveKey,
    });

    return parseOpenAiCompatibleResponse(data, (t) => this.pricingService.estimateTokens(t), promptEstimate);
  }
}
