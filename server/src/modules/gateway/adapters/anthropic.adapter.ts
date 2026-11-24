import { Injectable } from '@nestjs/common';
import { ProviderAdapter, GatewayChatRequest, AdapterExecutionResult, ChatMessage } from './provider.adapter.interface';
import { PricingService } from '@/modules/pricing/pricing.service';
import { resolveProviderKey } from './provider-key.util';
import { postProviderJson, usageInt, invalidMessagesError } from './provider-http';

/**
 * Anthropic's Messages API has no "system" role inside `messages`: instructions go in the
 * top-level `system` field. System messages are hoisted there (joined in order); the remaining
 * turns map to user/assistant. Previously they were sent as user turns, which downgraded the
 * operator's instructions to ordinary user input.
 */
export function buildAnthropicBody(req: GatewayChatRequest) {
  const system = req.messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .filter(Boolean)
    .join('\n\n');
  const turns = req.messages
    .filter((m) => m.role !== 'system')
    .map((m: ChatMessage) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  if (turns.length === 0) {
    // Anthropic rejects a conversation with no user turn; fail before the call (and before any spend).
    throw invalidMessagesError('At least one user or assistant message is required in addition to system messages.');
  }

  return {
    model: req.model,
    ...(system ? { system } : {}),
    messages: turns,
    max_tokens: req.maxTokens ?? 1000,
    temperature: req.temperature ?? 0.7,
  };
}

/**
 * Anthropic usage (official prompt-caching docs):
 *   input_tokens EXCLUDES cache reads and cache writes;
 *   total input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens;
 *   output_tokens is the billed output (thinking included).
 * Normalised so `promptTokens` is the TOTAL input and the cache parts are reported separately.
 */
export function parseAnthropicResponse(
  data: any,
  estimate: (text: string) => number,
  promptEstimate: number,
): AdapterExecutionResult {
  // content[] can start with a `thinking` block (always-on thinking models), so take text blocks only.
  const responseText = Array.isArray(data?.content)
    ? data.content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('')
    : '';

  const usage = data?.usage;
  const input = usageInt(usage?.input_tokens);
  const output = usageInt(usage?.output_tokens);
  const cacheRead = usageInt(usage?.cache_read_input_tokens) ?? 0;
  const cacheWriteTotal = usageInt(usage?.cache_creation_input_tokens) ?? 0;
  const oneHour = usageInt(usage?.cache_creation?.ephemeral_1h_input_tokens);
  const fiveMinute = usageInt(usage?.cache_creation?.ephemeral_5m_input_tokens);
  // Prefer the TTL breakdown; if absent, the documented default TTL is 5 minutes.
  const write1h = oneHour ?? 0;
  const write5m = fiveMinute ?? Math.max(0, cacheWriteTotal - write1h);

  const promptTokens = input === undefined ? promptEstimate : input + cacheRead + write5m + write1h;
  const completionTokens = output ?? estimate(responseText);

  return {
    responseText,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    isSimulated: false,
    cachedPromptTokens: cacheRead > 0 ? cacheRead : undefined,
    cacheWriteTokens: write5m + write1h > 0 ? { fiveMinute: write5m, oneHour: write1h } : undefined,
    usageEstimated: input === undefined || output === undefined,
  };
}

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  constructor(private readonly pricingService: PricingService) {}

  async execute(req: GatewayChatRequest, decryptedApiKey?: string): Promise<AdapterExecutionResult> {
    // Only the project's own key. The platform env key is a dev-only opt-in
    // (ALLOW_PLATFORM_PROVIDER_KEY=true and NODE_ENV !== 'production').
    const effectiveKey = resolveProviderKey('Anthropic', decryptedApiKey, 'ANTHROPIC_API_KEY', (k) => k.startsWith('sk-ant') && !k.includes('demo'));

    const body = buildAnthropicBody(req);
    const promptEstimate = this.pricingService.estimateTokens(req.messages.map((m) => m.content).join(' '));

    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const data = await postProviderJson({
      providerLabel: 'Anthropic',
      url: `${baseUrl}/messages`,
      headers: { 'x-api-key': effectiveKey, 'anthropic-version': '2023-06-01' },
      body,
      apiKey: effectiveKey,
    });

    return parseAnthropicResponse(data, (t) => this.pricingService.estimateTokens(t), promptEstimate);
  }
}
