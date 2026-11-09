import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
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

    if (!effectiveKey) {
      throw new HttpException(
        {
          error: {
            message: 'Anthropic Claude API key is not configured for this project. Please add your Anthropic key in Project Settings -> Key Vault.',
            type: 'provider_key_not_configured',
            code: 'missing_provider_key',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

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
