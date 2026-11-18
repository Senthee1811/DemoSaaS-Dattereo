import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';

@Injectable()
export class OpenAIAdapter implements ProviderAdapter {
  private readonly logger = new Logger(OpenAIAdapter.name);

  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    const effectiveKey = (decryptedApiKey && decryptedApiKey.startsWith('sk-') && !decryptedApiKey.includes('demo'))
      ? decryptedApiKey
      : (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-') && !process.env.OPENAI_API_KEY.includes('demo'))
        ? process.env.OPENAI_API_KEY
        : undefined;

    if (!effectiveKey) {
      throw new HttpException(
        {
          error: {
            message: 'OpenAI API key is not configured for this project. Please add your OpenAI key in Project Settings -> Key Vault.',
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

      // Overridable for OpenAI-compatible endpoints (Azure OpenAI proxies, self-hosted gateways, tests)
      const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errBody = await resp.text();
        this.logger.warn(`OpenAI upstream returned HTTP ${resp.status}: ${errBody}`);
        let errorPayload: any;
        try {
          errorPayload = JSON.parse(errBody);
        } catch {
          errorPayload = {
            error: {
              message: `OpenAI upstream error (HTTP ${resp.status}): ${errBody}`,
              type: 'upstream_provider_error',
              code: `upstream_${resp.status}`,
            },
          };
        }
        throw new HttpException(errorPayload, resp.status);
      }

      const data = await resp.json();
      const responseText = data.choices?.[0]?.message?.content || '';
      const pTokens = data.usage?.prompt_tokens || promptTokens;
      const cTokens = data.usage?.completion_tokens || this.pricingService.estimateTokens(responseText);

      return {
        responseText,
        promptTokens: pTokens,
        completionTokens: cTokens,
        totalTokens: pTokens + cTokens,
        isSimulated: false,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`OpenAI proxy network error: ${err.message}`);
      throw new HttpException(
        {
          error: {
            message: `OpenAI gateway connection error: ${err.message}`,
            type: 'upstream_gateway_timeout',
            code: 'upstream_network_error',
          },
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
  }
}
