import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';
import { resolveProviderKey } from './provider-key.util';

/**
 * Groq. Its chat endpoint is OpenAI-compatible, so this mirrors OpenAIAdapter with a different
 * base URL and key format. Same rule as the other adapters: only the project's own key is used
 * (the platform GROQ_API_KEY is a dev-only opt-in behind ALLOW_PLATFORM_PROVIDER_KEY), and a
 * missing key is 400 missing_provider_key before any upstream call.
 */
@Injectable()
export class GroqAdapter implements ProviderAdapter {
  private readonly logger = new Logger(GroqAdapter.name);

  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    const effectiveKey = resolveProviderKey('Groq', decryptedApiKey, 'GROQ_API_KEY', (k) => k.startsWith('gsk_') && !k.includes('demo'));

    const promptText = req.messages.map(m => m.content).join(' ');
    const promptTokens = this.pricingService.estimateTokens(promptText);

    try {
      const controller = new AbortController();
      const timeoutMs = Number(process.env.GATEWAY_PROXY_TIMEOUT_MS) || 60000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Overridable for tests and proxies
      const baseUrl = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
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
        // Groq limits are per organization and per model (RPM, RPD, TPM, TPD), so a 429 here is
        // Groq's own limit on the tenant's key: pass it through as a 429, never as a gateway error.
        this.logger.warn(`Groq upstream returned HTTP ${resp.status}: ${errBody}`);
        let errorPayload: any;
        try {
          errorPayload = JSON.parse(errBody);
        } catch {
          errorPayload = {
            error: {
              message: `Groq upstream error (HTTP ${resp.status}): ${errBody}`,
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
      this.logger.error(`Groq proxy network error: ${err.message}`);
      throw new HttpException(
        {
          error: {
            message: `Groq gateway connection error: ${err.message}`,
            type: 'upstream_gateway_timeout',
            code: 'upstream_network_error',
          },
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
  }
}
