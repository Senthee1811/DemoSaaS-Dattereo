/**
 * Maps each provider's stop reason to the OpenAI vocabulary the gateway returns, and keeps the raw
 * provider value so nothing is hidden. Value lists come from the providers' own docs (2026-11-24):
 *
 *  OpenAI:    stop | length | tool_calls | content_filter | function_call (deprecated)
 *  Anthropic: end_turn | max_tokens | stop_sequence | tool_use | pause_turn | refusal | model_context_window_exceeded
 *  Gemini:    STOP | MAX_TOKENS | SAFETY | RECITATION | LANGUAGE | OTHER | BLOCKLIST | PROHIBITED_CONTENT | SPII
 *             | MALFORMED_FUNCTION_CALL | IMAGE_* | NO_IMAGE | UNEXPECTED_TOOL_CALL | TOO_MANY_TOOL_CALLS
 *             | MISSING_THOUGHT_SIGNATURE | MALFORMED_RESPONSE | ESCALATION | PUP_LIMITED_DISABLED | CONTINUATION
 *  Groq:      OpenAI-compatible; its docs show only "stop", so the OpenAI set is assumed (not documented).
 *
 * `length` matters for money: the model was cut off by max_tokens (for thinking models possibly
 * with no visible text) and the tokens were still billed.
 */
export type OpenAiFinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter';

export interface NormalizedFinish {
  finishReason: OpenAiFinishReason;
  /** The provider's own value, verbatim. */
  providerFinishReason: string | null;
}

const OPENAI_SET: Record<string, OpenAiFinishReason> = {
  stop: 'stop',
  length: 'length',
  tool_calls: 'tool_calls',
  function_call: 'tool_calls',
  content_filter: 'content_filter',
};

const ANTHROPIC_SET: Record<string, OpenAiFinishReason> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  tool_use: 'tool_calls',
  pause_turn: 'tool_calls',
  refusal: 'content_filter',
};

const GEMINI_SET: Record<string, OpenAiFinishReason> = {
  STOP: 'stop',
  MAX_TOKENS: 'length',
  CONTINUATION: 'length',
  SAFETY: 'content_filter',
  RECITATION: 'content_filter',
  LANGUAGE: 'content_filter',
  BLOCKLIST: 'content_filter',
  PROHIBITED_CONTENT: 'content_filter',
  SPII: 'content_filter',
  IMAGE_SAFETY: 'content_filter',
  IMAGE_PROHIBITED_CONTENT: 'content_filter',
  IMAGE_RECITATION: 'content_filter',
  ESCALATION: 'content_filter',
  PUP_LIMITED_DISABLED: 'content_filter',
  MALFORMED_FUNCTION_CALL: 'tool_calls',
  UNEXPECTED_TOOL_CALL: 'tool_calls',
  TOO_MANY_TOOL_CALLS: 'tool_calls',
};

/** A value the provider did not document (or none at all) maps to 'stop'; the raw value is still returned. */
function normalize(table: Record<string, OpenAiFinishReason>, raw: unknown): NormalizedFinish {
  const provider = typeof raw === 'string' && raw ? raw : null;
  return { finishReason: (provider && table[provider]) || 'stop', providerFinishReason: provider };
}

export const finishFromOpenAiCompatible = (raw: unknown) => normalize(OPENAI_SET, raw);
export const finishFromAnthropic = (raw: unknown) => normalize(ANTHROPIC_SET, raw);
/** `blocked` = promptFeedback.blockReason was present and no candidate was produced. */
export const finishFromGemini = (raw: unknown, blocked = false): NormalizedFinish =>
  blocked && !raw ? { finishReason: 'content_filter', providerFinishReason: null } : normalize(GEMINI_SET, raw);
