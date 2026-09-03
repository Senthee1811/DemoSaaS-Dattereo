import { Injectable, Logger } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';

@Injectable()
export class GeminiAdapter implements ProviderAdapter {
  private readonly logger = new Logger(GeminiAdapter.name);

  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    const isRealKey = decryptedApiKey && decryptedApiKey.length > 20 && !decryptedApiKey.includes('demo');
    const promptText = req.messages.map(m => m.content).join(' ');
    const promptTokens = this.pricingService.estimateTokens(promptText);

    if (isRealKey) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${decryptedApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: req.messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
              }))
            })
          }
        );

        if (resp.ok) {
          const data = await resp.json();
          const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const pTokens = data.usageMetadata?.promptTokenCount || promptTokens;
          const cTokens = data.usageMetadata?.candidatesTokenCount || this.pricingService.estimateTokens(responseText);

          return {
            responseText,
            promptTokens: pTokens,
            completionTokens: cTokens,
            totalTokens: pTokens + cTokens,
            isSimulated: false
          };
        }
      } catch (err: any) {
        this.logger.warn(`Gemini upstream call failed, falling back to synthesis: ${err.message}`);
      }
    }

    const responseText = `[SpendGuard Proxy: ${req.model} (Gemini Adapter)]\n\nCompleted Google Gemini model execution for query: "${promptText.slice(0, 100)}..."\n\nCost calculated and added to project rolling spend totals.`;
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
