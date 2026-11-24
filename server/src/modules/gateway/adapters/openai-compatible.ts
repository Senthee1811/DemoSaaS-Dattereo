import { AdapterExecutionResult, GatewayChatRequest } from './provider.adapter.interface';
import { usageInt } from './provider-http';
import { finishFromOpenAiCompatible } from './finish-reason';

/**
 * Request body for OpenAI-style /chat/completions (OpenAI, Groq).
 *
 * The output limit is sent as `max_completion_tokens`: OpenAI's reference marks `max_tokens` deprecated
 * ("not compatible with o-series models") and defines max_completion_tokens as the bound on visible
 * output AND reasoning tokens, which is exactly what the budget hold assumes. Groq's reference also
 * deprecates max_tokens in its favour. For OpenAI-compatible endpoints that only know the old name
 * (some proxies, Azure variants) set OPENAI_MAX_TOKENS_PARAM=max_tokens.
 *
 * `system` is OpenAI's older instruction role; its docs say o1 and newer should use `developer`.
 * Set OPENAI_SYSTEM_ROLE=developer to send that instead. Default stays `system` (works on the models
 * and compatible endpoints verified so far).
 */
export function buildOpenAiCompatibleBody(req: GatewayChatRequest, opts: { forOpenAi?: boolean } = {}) {
  const limit = req.maxTokens ?? 1000;
  const param = opts.forOpenAi && process.env.OPENAI_MAX_TOKENS_PARAM === 'max_tokens' ? 'max_tokens' : 'max_completion_tokens';
  const systemRole = opts.forOpenAi && process.env.OPENAI_SYSTEM_ROLE === 'developer' ? 'developer' : undefined;
  return {
    model: req.model,
    messages: systemRole ? req.messages.map((m) => (m.role === 'system' ? { ...m, role: systemRole } : m)) : req.messages,
    temperature: req.temperature ?? 0.7,
    [param]: limit,
  };
}

/**
 * Maps an OpenAI-style response to normalised usage.
 *  - prompt_tokens already INCLUDES cached tokens (prompt_tokens_details.cached_tokens is a subset;
 *    confirmed for Groq in its prompt-caching docs, same shape as OpenAI's chat completions).
 *  - completion_tokens already INCLUDES reasoning tokens (completion_tokens_details.reasoning_tokens
 *    is informational), so billing must not add them again.
 * A provider that omits usage gets SpendGuard's estimate, and the result says so.
 */
export function parseOpenAiCompatibleResponse(
  data: any,
  estimate: (text: string) => number,
  promptEstimate: number,
): AdapterExecutionResult {
  const raw = data?.choices?.[0]?.message?.content;
  const responseText = typeof raw === 'string' ? raw : '';
  const usage = data?.usage;

  const reportedPrompt = usageInt(usage?.prompt_tokens);
  const reportedCompletion = usageInt(usage?.completion_tokens);
  const promptTokens = reportedPrompt ?? promptEstimate;
  const completionTokens = reportedCompletion ?? estimate(responseText);

  const cached = usageInt(usage?.prompt_tokens_details?.cached_tokens);
  const reasoning = usageInt(usage?.completion_tokens_details?.reasoning_tokens);

  return {
    responseText,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    isSimulated: false,
    // A cached count can never exceed the prompt it is part of
    cachedPromptTokens: cached !== undefined ? Math.min(cached, promptTokens) : undefined,
    reasoningTokens: reasoning !== undefined ? Math.min(reasoning, completionTokens) : undefined,
    usageEstimated: reportedPrompt === undefined || reportedCompletion === undefined,
    ...finishFromOpenAiCompatible(data?.choices?.[0]?.finish_reason),
  };
}
