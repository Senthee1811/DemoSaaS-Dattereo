import { AdapterExecutionResult, GatewayChatRequest } from './provider.adapter.interface';
import { usageInt } from './provider-http';

/** Request body for OpenAI-style /chat/completions (OpenAI, Groq). System messages stay in `messages`. */
export function buildOpenAiCompatibleBody(req: GatewayChatRequest) {
  return {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: req.maxTokens ?? 1000,
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
  };
}
