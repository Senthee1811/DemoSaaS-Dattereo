import { ModelPricingConfig, computeCost } from '@/modules/pricing/pricing.service';

/**
 * What would the SAME historical traffic have cost on another model? Deterministic arithmetic over the ledger's
 * token totals and the configured prices. It answers a cost question only.
 *
 *  - It NEVER says a cheaper model is as good: output quality, latency, tool use, safety behaviour and tokenizer
 *    differences are not measured, and every result carries `qualityEquivalence: 'not_assessed'`.
 *  - A saving is a RANGE, not a point: the low end re-prices at the observed cache rate with identical token counts,
 *    the high end assumes no caching and, where a provider documents it, a tokenizer difference.
 *  - Any migration needs human approval. SpendGuard changes no model configuration.
 */

export interface UsageGroup {
  model: string;
  provider: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  /** Input tokens served from the provider's prompt cache (a subset of tokensIn), from the ledger metadata */
  cachedTokensIn: number;
  actualCostUsd: number;
  avgTokensIn: number;
  p50TokensIn: number;
  p95TokensIn: number;
  maxTokensIn: number;
  avgTokensOut: number;
  p50TokensOut: number;
  p95TokensOut: number;
  maxTokensOut: number;
}

export interface CandidateModel extends ModelPricingConfig {
  model: string;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
export interface CompatibilityCheck {
  id: 'context_window' | 'provider_key' | 'lifecycle';
  status: CheckStatus;
  detail: string;
}

export interface Comparison {
  candidate: { model: string; provider: string; inputPricePerMillion: number; outputPricePerMillion: number; cachedInputPrice: number | null; contextWindow: number | null };
  /** Hypothetical cost of the group's historical tokens on the candidate */
  hypotheticalUsd: { low: number; high: number };
  /** actual − hypothetical; positive = cheaper. A range, and it can be negative. */
  savingsUsd: { low: number; high: number };
  savingsPercent: { low: number | null; high: number | null };
  assumptions: string[];
  checks: CompatibilityCheck[];
  /** false when any check FAILS (e.g. the context window is smaller than prompts already seen) */
  eligible: boolean;
  qualityEquivalence: 'not_assessed';
  requiresHumanApproval: true;
}

const round = (n: number, d = 6) => Number(n.toFixed(d));

/** Documented tokenizer difference: Anthropic says models from Claude Opus 4.7 on count ~30% more tokens for the same text. */
export const ANTHROPIC_TOKENIZER_FACTOR = 1.3;

export const NOT_ASSESSED = ['output quality', 'latency', 'tool / function calling', 'vision', 'structured-output (JSON) support', 'safety and refusal behaviour', 'rate limits and availability'];
export const GATEWAY_LIMITATIONS = ['The gateway currently supports text chat completions only (no streaming, tools, images or JSON mode).'];

export function compareGroupToCandidate(
  group: UsageGroup,
  candidate: CandidateModel,
  ctx: { hasProviderKey: boolean },
): Comparison {
  const assumptions: string[] = [
    'Uses the historical token counts of this model unchanged; the candidate\'s tokenizer was not re-measured.',
    'Prices are the currently configured catalog prices; past requests are re-priced, not re-run.',
  ];

  // Low end: observed cache rate carries over where the candidate has a cached price
  const cachedShare = group.tokensIn > 0 ? group.cachedTokensIn / group.tokensIn : 0;
  const canCache = candidate.cachedInputPrice !== undefined && candidate.cachedInputPrice !== null;
  const low = computeCost(candidate, group.tokensIn, group.tokensOut, { cachedTokens: canCache ? Math.round(group.tokensIn * cachedShare) : 0 });
  if (cachedShare > 0 && canCache) assumptions.push(`Low end assumes the observed prompt-cache hit rate (${(cachedShare * 100).toFixed(0)}% of input) carries over to the candidate.`);
  if (cachedShare > 0 && !canCache) assumptions.push('The candidate has no cached-input price, so cached input is priced at the full input rate.');

  // High end: no caching, plus a documented tokenizer effect
  let inFactor = 1;
  if (candidate.provider === 'ANTHROPIC' && group.provider !== 'ANTHROPIC') {
    inFactor = ANTHROPIC_TOKENIZER_FACTOR;
    assumptions.push('High end applies Anthropic\'s documented ~30% higher token count (newer tokenizer) to input tokens; output-token difference is unknown.');
  } else if (candidate.provider !== group.provider) {
    assumptions.push('Token counts differ between providers\' tokenizers by an unmeasured amount.');
  }
  const high = computeCost(candidate, Math.round(group.tokensIn * inFactor), group.tokensOut, {});

  const lowUsd = Math.min(low, high);
  const highUsd = Math.max(low, high);
  const sLow = group.actualCostUsd - highUsd;
  const sHigh = group.actualCostUsd - lowUsd;
  const pct = (v: number) => (group.actualCostUsd > 0 ? round((v / group.actualCostUsd) * 100, 1) : null);

  // ── Compatibility ────────────────────────────────────────────────────
  const checks: CompatibilityCheck[] = [];
  if (candidate.contextWindow == null) {
    checks.push({ id: 'context_window', status: 'unknown', detail: `The catalog has no context window for ${candidate.model}; the largest prompt seen on ${group.model} was ${group.maxTokensIn.toLocaleString('en-US')} tokens.` });
  } else if (group.maxTokensIn > candidate.contextWindow) {
    checks.push({ id: 'context_window', status: 'fail', detail: `The largest prompt seen (${group.maxTokensIn.toLocaleString('en-US')} tokens) exceeds ${candidate.model}'s ${candidate.contextWindow.toLocaleString('en-US')}-token context window.` });
  } else if (group.maxTokensIn + group.maxTokensOut > candidate.contextWindow * 0.8) {
    checks.push({ id: 'context_window', status: 'warn', detail: `The largest prompt plus reply seen uses over 80% of ${candidate.model}'s ${candidate.contextWindow.toLocaleString('en-US')}-token window.` });
  } else {
    checks.push({ id: 'context_window', status: 'pass', detail: `The largest prompt seen (${group.maxTokensIn.toLocaleString('en-US')} tokens) fits ${candidate.model}'s ${candidate.contextWindow.toLocaleString('en-US')}-token window.` });
  }
  checks.push(
    ctx.hasProviderKey || candidate.provider === group.provider
      ? { id: 'provider_key', status: 'pass', detail: `A ${candidate.provider} key is available in this scope.` }
      : { id: 'provider_key', status: 'warn', detail: `No ${candidate.provider} provider key is stored for this scope; one must be added in Key Vault before using it.` },
  );
  if (candidate.providerStatus === 'missing') {
    checks.push({ id: 'lifecycle', status: 'warn', detail: `${candidate.provider} no longer lists ${candidate.model} in its models endpoint.` });
  } else if (candidate.retiresAt) {
    checks.push({ id: 'lifecycle', status: 'warn', detail: `${candidate.model} is announced to retire on ${new Date(candidate.retiresAt).toISOString().slice(0, 10)}.` });
  } else {
    checks.push({ id: 'lifecycle', status: 'pass', detail: 'No retirement announced in the catalog.' });
  }

  return {
    candidate: {
      model: candidate.model,
      provider: candidate.provider,
      inputPricePerMillion: candidate.inputPricePerMillion,
      outputPricePerMillion: candidate.outputPricePerMillion,
      cachedInputPrice: candidate.cachedInputPrice ?? null,
      contextWindow: candidate.contextWindow ?? null,
    },
    hypotheticalUsd: { low: round(lowUsd), high: round(highUsd) },
    savingsUsd: { low: round(sLow), high: round(sHigh) },
    savingsPercent: { low: pct(sLow), high: pct(sHigh) },
    assumptions,
    checks,
    eligible: !checks.some((c) => c.status === 'fail'),
    qualityEquivalence: 'not_assessed',
    requiresHumanApproval: true,
  };
}

/** Rank by the CONSERVATIVE saving (the low end), so a candidate only ranks high if it saves money even in the worse case. */
export function rankComparisons(list: Comparison[]): Comparison[] {
  return [...list].sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.savingsUsd.low - a.savingsUsd.low);
}
