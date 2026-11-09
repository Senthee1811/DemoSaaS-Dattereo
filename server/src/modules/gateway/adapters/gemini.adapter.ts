import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';

@Injectable()
export class GeminiAdapter implements ProviderAdapter {
  private readonly logger = new Logger(GeminiAdapter.name);

  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    const effectiveKey = (decryptedApiKey && decryptedApiKey.length > 20 && !decryptedApiKey.includes('demo'))
      ? decryptedApiKey
      : (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 20 && !process.env.GEMINI_API_KEY.includes('demo'))
        ? process.env.GEMINI_API_KEY
        : undefined;

    if (!effectiveKey) {
      throw new HttpException(
        {
          error: {
            message: 'Google Gemini API key is not configured for this project. Please add your Gemini key in Project Settings -> Key Vault.',
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

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${effectiveKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: req.messages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errBody = await resp.text();
        this.logger.warn(`Gemini upstream returned HTTP ${resp.status}: ${errBody}`);
        let errorPayload: any;
        try {
          errorPayload = JSON.parse(errBody);
        } catch {
          errorPayload = {
            error: {
              message: `Gemini upstream error (HTTP ${resp.status}): ${errBody}`,
              type: 'upstream_provider_error',
              code: `upstream_${resp.status}`,
            },
          };
        }
        throw new HttpException(errorPayload, resp.status);
      }

      const data = await resp.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const pTokens = data.usageMetadata?.promptTokenCount || promptTokens;
      const cTokens = data.usageMetadata?.candidatesTokenCount || this.pricingService.estimateTokens(responseText);

      return {
        responseText,
        promptTokens: pTokens,
        completionTokens: cTokens,
        totalTokens: pTokens + cTokens,
        isSimulated: false,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Gemini proxy network error: ${err.message}`);
      throw new HttpException(
        {
          error: {
            message: `Gemini gateway connection error: ${err.message}`,
            type: 'upstream_gateway_timeout',
            code: 'upstream_network_error',
          },
        },
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
  }
}
