/**
 * Conservative PRE-FLIGHT token estimation for budget reservations.
 *
 * Why not characters / 4: measured against OpenAI's real BPE tokenizers (o200k_base, cl100k_base)
 * it is fine for English prose but under-counts badly elsewhere (estimate / actual): JSON 0.57,
 * digits 0.75, CJK 0.34, emoji 0.30, base64 0.37. A worst-case hold built on it under-reserves
 * exactly the traffic where it matters. See test/token-estimator.spec.ts, which re-measures this.
 *
 * The estimate is only used to size the HOLD. Settlement always uses the provider-reported usage,
 * so over-estimating costs a little headroom near the cap, never money; under-estimating risks an
 * overrun (recorded and exposed, see GatewayService). That asymmetry is why this errs high.
 *
 * Provider tokenizers other than OpenAI's are NOT available offline, so for them the class model
 * is scaled by a per-provider margin (see providerEstimateMargin) justified by provider docs.
 */

/** Tokens per character, by character class. Tuned so the estimate is >= the real BPE count on the test corpus. */
export const TOKENS_PER_CHAR = {
  /** letters, whitespace: English prose is ~0.2 tokens/char; this is ~1.35x that */
  word: 0.27,
  digit: 0.4,
  /** ASCII punctuation / symbols (JSON structure, code) */
  punct: 0.65,
  /** per UTF-16 code unit outside ASCII (CJK, accents, emoji = 2 units); cl100k emoji measured ~1.3 */
  nonAscii: 1.4,
  /** long unbroken alnum runs: base64, hex, uuids, tokens */
  denseRun: 0.8,
} as const;

/** A run of this many contiguous [A-Za-z0-9+/=_-] chars is treated as high-entropy (base64/hex/id). */
const DENSE_RUN_MIN = 20;
const DENSE_RUN_RE = new RegExp(`[A-Za-z0-9+/=_-]{${DENSE_RUN_MIN},}`, 'g');

/** Chat formats add a few tokens per message (role, delimiters) plus a reply primer. */
export const TOKENS_PER_MESSAGE = 4;
export const TOKENS_REPLY_PRIMER = 3;

/** Estimated tokens for raw text: always >= 1 for non-empty text, 0 for empty. */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let tokens = 0;

  // High-entropy runs first; remove them so their characters are not counted twice
  const rest = text.replace(DENSE_RUN_RE, (run) => {
    tokens += run.length * TOKENS_PER_CHAR.denseRun;
    return ' ';
  });

  for (let i = 0; i < rest.length; i++) {
    const c = rest.charCodeAt(i);
    if (c >= 128) tokens += TOKENS_PER_CHAR.nonAscii;
    else if ((c >= 48 && c <= 57)) tokens += TOKENS_PER_CHAR.digit;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 32 || c === 10 || c === 13 || c === 9) tokens += TOKENS_PER_CHAR.word;
    else tokens += TOKENS_PER_CHAR.punct;
  }
  return Math.max(1, Math.ceil(tokens));
}

/** Estimated prompt tokens for a chat: every message's text plus per-message framing. No provider margin. */
export function estimateChatTokens(messages: Array<{ content: string }>): number {
  let total = TOKENS_REPLY_PRIMER;
  for (const m of messages) total += TOKENS_PER_MESSAGE + estimateTextTokens(m.content ?? '');
  return total;
}

export type EstimateProvider = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ';

/**
 * Multiplier applied on top of the class-model estimate, per provider.
 *  - OPENAI / GROQ: tokenizer measured offline; the class model already sits above the real count,
 *    so only a small margin remains for framing differences.
 *  - ANTHROPIC: Anthropic documents that models from Claude Opus 4.7 on (the 5.x family included)
 *    use a tokenizer producing ~30% MORE tokens than earlier models for the same text, and that
 *    its own pre-flight count is "an estimate". 1.40 = that 30% plus 10% headroom. Not measured here.
 *  - GEMINI: Google documents "about 4 characters per token"; the tokenizer is not available
 *    offline, so it gets a moderate margin. Not measured here.
 * Override with GATEWAY_ESTIMATE_MARGIN_<PROVIDER> (a multiplier such as 1.25; must be >= 1).
 */
export function providerEstimateMargin(provider: EstimateProvider): number {
  const defaults: Record<EstimateProvider, number> = { OPENAI: 1.1, GROQ: 1.1, GEMINI: 1.25, ANTHROPIC: 1.4 };
  const override = Number(process.env[`GATEWAY_ESTIMATE_MARGIN_${provider}`]);
  return Number.isFinite(override) && override >= 1 ? override : defaults[provider];
}

/** The prompt-token figure used to size a hold: class-model estimate x provider margin. */
export function estimateReservationPromptTokens(provider: EstimateProvider, messages: Array<{ content: string }>): number {
  return Math.ceil(estimateChatTokens(messages) * providerEstimateMargin(provider));
}

/**
 * Extra output tokens to reserve beyond max_tokens for Gemini "thinking": Google documents that
 * thinking is billed as output and that max_output_tokens includes it for the Interactions API,
 * but the generateContent reference does not state it. Default 0 (trust maxOutputTokens);
 * raise GATEWAY_GEMINI_THINKING_RESERVE_TOKENS to reserve defensively. Overruns are recorded either way.
 */
export function outputReserveTokens(provider: EstimateProvider): number {
  if (provider !== 'GEMINI') return 0;
  const v = Number(process.env.GATEWAY_GEMINI_THINKING_RESERVE_TOKENS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}
