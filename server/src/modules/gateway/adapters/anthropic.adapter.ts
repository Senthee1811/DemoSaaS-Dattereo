import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';
import { resolveProviderKey } from './provider-key.util';

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  private readonly logger = new Logger(AnthropicAdapter.name);

  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    // Only the project's own key. The platform env key is a dev-only opt-in
    // (ALLOW_PLATFORM_PROVIDER_KEY=true and NODE_ENV !== 'production').
    const effectiveKey = resolveProviderKey('Anthropic', decryptedApiKey, 'ANTHROPIC_API_KEY', (k) => k.startsWith('sk-ant') && !k.includes('demo'));

    const promptText = req.messages.map(m => m.content).join(' ');
    const promptTokens = this.pricingService.estimateTokens(promptText);

    try {
      const controller = new AbortController();
      const timeoutMs = Number(process.env.GATEWAY_PROXY_TIMEOUT_MS) || 60000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          max_tokens: req.maxTokens ?? 1000,
          temperature: req.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errBody = await resp.text();
        this.logger.warn(`Anthropic upstream returned HTTP ${resp.status}: ${errBody}`);
        let errorPayload: any;
        try {
          errorPayload = JSON.parse(errBody);
        } catch {
          errorPayload = {
            error: {
              message: `Anthropic upstream error (HTTP ${resp.status}): ${errBody}`,
              type: 'upstream_provider_error',
              code: `upstream_${resp.status}`,
            },
          };
        }
        throw new HttpException(errorPayload, resp.status);
      }

      const data = await resp.json();
      const responseText = data.content?.[0]?.text || '';
      const pTokens = data.usage?.input_tokens || promptTokens;
      const cTokens = data.usage?.output_tokens || this.pricingService.estimateTokens(responseText);

      return {
        responseText,
        promptTokens: pTokens,
        completionTokens: cTokens,
        totalTokens: pTokens + cTokens,
        isSimulated: false,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Anthropic proxy network error: ${err.message}`);
      throw new HttpException(
        {
          error: {
            message: `Anthropic gateway connection error: ${err.message}`,
            type: 'upstream_gateway_timeout',
            code: 'upstream_network_error',
          },
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
  }
}
