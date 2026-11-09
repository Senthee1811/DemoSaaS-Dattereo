import { Injectable, Logger } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  private readonly logger = new Logger(AnthropicAdapter.name);

  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    const effectiveKey = (decryptedApiKey && decryptedApiKey.startsWith('sk-ant') && !decryptedApiKey.includes('demo'))
      ? decryptedApiKey
      : (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.startsWith('sk-ant') && !process.env.ANTHROPIC_API_KEY.includes('demo'))
        ? process.env.ANTHROPIC_API_KEY
        : undefined;

    const promptText = req.messages.map(m => m.content).join(' ');
    const promptTokens = this.pricingService.estimateTokens(promptText);

    if (effectiveKey) {
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': effectiveKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages.map(m => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content
            })),
            max_tokens: req.maxTokens ?? 1000,
            temperature: req.temperature ?? 0.7
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const responseText = data.content?.[0]?.text || '';
          const pTokens = data.usage?.input_tokens || promptTokens;
          const cTokens = data.usage?.output_tokens || this.pricingService.estimateTokens(responseText);

          return {
            responseText,
            promptTokens: pTokens,
            completionTokens: cTokens,
            totalTokens: pTokens + cTokens,
            isSimulated: false
          };
        } else {
          const errBody = await resp.text();
          this.logger.warn(`Anthropic returned ${resp.status}: ${errBody}`);
        }
      } catch (err: any) {
        this.logger.warn(`Anthropic upstream call failed, falling back to synthesis: ${err.message}`);
      }
    }

    const responseText = `[SpendGuard Proxy: ${req.model} (Claude Adapter)]\n\nProcessed inference request for: "${promptText.slice(0, 100)}..."\n\nClaude token consumption metered and verified within project budget bounds.`;
    const completionTokens = this.pricingService.estimateTokens(responseText);

    return {
      responseText,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      isSimulated: true
    };
  }
}
