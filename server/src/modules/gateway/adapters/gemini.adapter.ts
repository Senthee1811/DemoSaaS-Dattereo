import { Injectable } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';
import { resolveProviderKey } from './provider-key.util';
import { postProviderJson, usageInt, invalidMessagesError } from './provider-http';
import { finishFromGemini } from './finish-reason';

/**
 * Gemini generateContent body.
 *  - `generationConfig.maxOutputTokens` enforces the output limit the budget hold was sized for.
 *    (It was never sent before, so the hold assumed a cap Gemini did not apply.) Per Google's docs
 *    it also bounds thinking tokens.
 *  - `temperature` is forwarded only when the caller set one: Gemini's own default is kept
 *    otherwise (Google documents it as silently ignored on the newest models anyway).
 *  - System messages go to `systemInstruction`, not into `contents` as user turns.
 */
export function buildGeminiBody(req: GatewayChatRequest) {
  const system = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .filter(Boolean)
    .join('\n\n');
  const contents = req.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  if (contents.length === 0) {
    throw invalidMessagesError('At least one user or assistant message is required in addition to system messages.');
  }

  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 1000,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    },
  };
}

/**
 * Gemini usageMetadata (Google API reference + thinking guide):
 *  - promptTokenCount INCLUDES cachedContentTokenCount.
 *  - candidatesTokenCount EXCLUDES thinking; thoughtsTokenCount is separate and is BILLED AS OUTPUT.
 *    So billed output = candidatesTokenCount + thoughtsTokenCount. Using candidates alone
 *    under-billed every thinking model.
 */
export function parseGeminiResponse(
  data: any,
  estimate: (text: string) => number,
  promptEstimate: number,
): AdapterExecutionResult {
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const responseText = parts
    .filter((p) => typeof p?.text === 'string' && p.thought !== true)
    .map((p) => p.text)
    .join('');

  const u = data?.usageMetadata;
  const prompt = usageInt(u?.promptTokenCount);
  const candidates = usageInt(u?.candidatesTokenCount);
  const thoughts = usageInt(u?.thoughtsTokenCount);
  const cached = usageInt(u?.cachedContentTokenCount);

  const promptTokens = prompt ?? promptEstimate;
  // A response with usageMetadata but no candidatesTokenCount produced no candidate tokens
  // (e.g. blocked); without any usageMetadata we can only estimate.
  const completionTokens = u ? (candidates ?? 0) + (thoughts ?? 0) : estimate(responseText);

  return {
    responseText,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    isSimulated: false,
    cachedPromptTokens: cached !== undefined ? Math.min(cached, promptTokens) : undefined,
    reasoningTokens: thoughts,
    usageEstimated: !u || prompt === undefined,
    ...finishFromGemini(data?.candidates?.[0]?.finishReason, !!data?.promptFeedback?.blockReason && !data?.candidates?.length),
  };
}

@Injectable()
export class GeminiAdapter implements ProviderAdapter {
  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    // Only the project's own key. The platform env key is a dev-only opt-in
    // (ALLOW_PLATFORM_PROVIDER_KEY=true and NODE_ENV !== 'production').
    const effectiveKey = resolveProviderKey('Google Gemini', decryptedApiKey, 'GEMINI_API_KEY', (k) => k.length > 20 && !k.includes('demo'));

    const body = buildGeminiBody(req);
    const promptEstimate = this.pricingService.estimateTokens(req.messages.map((m) => m.content).join(' '));

    const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const data = await postProviderJson({
      providerLabel: 'Google Gemini',
      url: `${baseUrl}/models/${encodeURIComponent(req.model)}:generateContent`,
      // Key in a header, not the query string, so it never lands in URL/error logs
      headers: { 'x-goog-api-key': effectiveKey },
      body,
      apiKey: effectiveKey,
    });

    return parseGeminiResponse(data, (t) => this.pricingService.estimateTokens(t), promptEstimate);
  }
}
