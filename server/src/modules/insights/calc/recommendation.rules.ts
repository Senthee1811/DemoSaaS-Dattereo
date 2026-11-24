import { Decomposition, HistoricalContext } from './investigation.calc';
import { ForecastResult } from './forecast.calc';
import { Comparison, UsageGroup } from './comparison.calc';

/**
 * Deterministic recommendation rules. Each rule is a pure function from ledger-derived numbers to either a
 * draft recommendation or null. Nothing is estimated by a model; thresholds are explicit constants; every draft
 * carries the numbers it came from (`evidence`), how they were combined (`method`), the money involved (impact)
 * and how sure we are (confidence). A rule returns null rather than a weak recommendation.
 */

export type Severity = 'info' | 'warning' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';
export type RecommendationType = 'SPEND_INCREASE' | 'MODEL_CONCENTRATION' | 'BUDGET_RISK' | 'MODEL_EVALUATION' | 'HIGH_TOKEN_APPLICATION';

export interface RecommendationDraft {
  type: RecommendationType;
  projectId: string | null;
  /** Stable identity: regeneration updates the same finding instead of creating a duplicate */
  fingerprint: string;
  severity: Severity;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  method: string;
  impactLowUsd: number | null;
  impactHighUsd: number | null;
  impactBasis: string | null;
  confidence: Confidence;
  action: string;
  requiresApproval: boolean;
}

export const THRESHOLDS = {
  spendIncrease: { minRatio: 1.5, minDeltaUsd: 1, minPercentileRank: 0.9, minMultipleOfMedian: 2 },
  concentration: { minShare: 0.6, minTotalUsd: 5, minModels: 2 },
  modelEvaluation: { minSavingsPercentLow: 15, minMonthlySavingsLowUsd: 5, minRequests: 100 },
  highTokenApp: { minRatioToPeers: 3, minRequests: 50, minApps: 2 },
} as const;

const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`;
const round = (n: number, d = 4) => Number(n.toFixed(d));
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── 1. Unusual expenditure increase ─────────────────────────────────────────
export function spendIncreaseRule(p: {
  projectId: string;
  projectName: string;
  windowDays: number;
  decomposition: Decomposition;
  historical: HistoricalContext | null;
  baselineSufficiency: 'insufficient' | 'low' | 'medium' | 'high';
  topContributors: Array<{ dimension: string; label: string; deltaUsd: number }>;
  evidenceRequestIds: string[];
}): RecommendationDraft | null {
  const d = p.decomposition;
  const t = THRESHOLDS.spendIncrease;
  if (d.status !== 'ok' || p.baselineSufficiency === 'insufficient' || !p.historical) return null;
  const ratio = d.baselineSpendUsd > 0 ? d.windowSpendUsd / d.baselineSpendUsd : 0;
  const unusual = p.historical.percentileRank >= t.minPercentileRank || (p.historical.multipleOfMedian ?? 0) >= t.minMultipleOfMedian;
  if (ratio < t.minRatio || d.deltaUsd < t.minDeltaUsd || !unusual) return null;
  const dominant = d.dominant === 'requestVolume' ? 'more requests' : d.dominant === 'tokensPerRequest' ? 'more tokens per request' : 'a higher price per token (model mix or pricing)';
  return {
    type: 'SPEND_INCREASE',
    projectId: p.projectId,
    fingerprint: `SPEND_INCREASE:${p.projectId}`,
    severity: ratio >= 3 ? 'critical' : 'warning',
    title: `Spend in “${p.projectName}” is ${ratio.toFixed(1)}× its recent baseline`,
    summary: `The last ${p.windowDays} day${p.windowDays === 1 ? '' : 's'} cost ${usd(d.windowSpendUsd)} versus ${usd(d.baselineSpendUsd)} expected from the preceding baseline (+${usd(d.deltaUsd)}). The largest factor is ${dominant}.`,
    evidence: {
      window: { days: p.windowDays, spendUsd: d.windowSpendUsd },
      baselineScaledUsd: d.baselineSpendUsd,
      deltaUsd: d.deltaUsd,
      effects: d.effects,
      historical: p.historical,
      topContributors: p.topContributors.slice(0, 5),
      ledgerRequestIds: p.evidenceRequestIds.slice(0, 10),
    },
    method: `Window spend compared with the preceding baseline scaled to the same length. Flagged when the ratio ≥ ${t.minRatio}, the increase ≥ ${usd(t.minDeltaUsd)}, and the window's daily rate is at or above the ${t.minPercentileRank * 100}th percentile of baseline days or ≥ ${t.minMultipleOfMedian}× their median. The change is split exactly into request volume, tokens per request and price per token.`,
    impactLowUsd: round(d.deltaUsd),
    impactHighUsd: round(d.deltaUsd),
    impactBasis: `observed excess over the last ${p.windowDays} day${p.windowDays === 1 ? '' : 's'} (not a prediction)`,
    confidence: p.baselineSufficiency === 'high' ? 'high' : p.baselineSufficiency === 'medium' ? 'medium' : 'low',
    action: 'Open the investigation for this period to see which models, keys and applications drove the change, and check whether it was intended.',
    requiresApproval: false,
  };
}

// ── 2. One model dominates spend ────────────────────────────────────────────
export function modelConcentrationRule(p: {
  projectId: string;
  projectName: string;
  days: number;
  models: Array<{ model: string; spendUsd: number; requests: number }>;
}): RecommendationDraft | null {
  const t = THRESHOLDS.concentration;
  const total = p.models.reduce((a, m) => a + m.spendUsd, 0);
  if (p.models.length < t.minModels || total < t.minTotalUsd) return null;
  const top = [...p.models].sort((a, b) => b.spendUsd - a.spendUsd)[0];
  const share = top.spendUsd / total;
  if (share < t.minShare) return null;
  return {
    type: 'MODEL_CONCENTRATION',
    projectId: p.projectId,
    fingerprint: `MODEL_CONCENTRATION:${p.projectId}:${top.model}`,
    severity: 'info',
    title: `${top.model} is ${(share * 100).toFixed(0)}% of spend in “${p.projectName}”`,
    summary: `${top.model} accounts for ${usd(top.spendUsd)} of ${usd(total)} over the last ${p.days} days across ${top.requests.toLocaleString('en-US')} requests.`,
    evidence: { days: p.days, totalSpendUsd: round(total), models: p.models.map((m) => ({ ...m, share: round(m.spendUsd / total) })) },
    method: `Share of ledger spend by model over ${p.days} days; flagged when one of at least ${t.minModels} models holds ≥ ${t.minShare * 100}% of at least ${usd(t.minTotalUsd)} of spend.`,
    impactLowUsd: null,
    impactHighUsd: null,
    impactBasis: null,
    confidence: 'high',
    action: `Check that this workload needs ${top.model}. The model comparison shows what the same traffic would cost on other models (cost only; quality is not assessed).`,
    requiresApproval: false,
  };
}

// ── 3. Likely to exceed its budget ──────────────────────────────────────────
export function budgetRiskRule(p: { projectId: string; projectName: string; forecast: ForecastResult }): RecommendationDraft | null {
  const f = p.forecast;
  if (!f.budget || !f.forecast) return null;
  if (f.budget.status !== 'at_risk' && f.budget.status !== 'likely_exceed') return null;
  const b = f.budget;
  const fc = f.forecast;
  return {
    type: 'BUDGET_RISK',
    projectId: p.projectId,
    fingerprint: `BUDGET_RISK:${p.projectId}:${f.month}`,
    severity: b.status === 'likely_exceed' ? 'critical' : 'warning',
    title: `“${p.projectName}” is ${b.status === 'likely_exceed' ? 'likely to exceed' : 'at risk of exceeding'} its monthly budget`,
    summary: `Projected month-end spend is ${usd(fc.projectedMonthEndUsd)} (range ${usd(fc.lowUsd)}–${usd(fc.highUsd)}) against a ${usd(b.budgetUsd)} budget; ${usd(f.actual.monthToDateUsd)} has been spent so far.${b.projectedExceedDate ? ` At the current rate the budget is reached around ${b.projectedExceedDate}.` : ''}`,
    evidence: { month: f.month, actual: f.actual, forecast: fc, budget: b, sufficiency: f.sufficiency, warnings: f.warnings },
    method: f.method,
    impactLowUsd: round(Math.max(0, fc.lowUsd - b.budgetUsd)),
    impactHighUsd: round(Math.max(0, fc.highUsd - b.budgetUsd)),
    impactBasis: 'projected spend above the budget by month end (a forecast, not actual spend)',
    confidence: f.sufficiency === 'insufficient' ? 'low' : (f.sufficiency as Confidence),
    action: 'Review the budget and the biggest cost drivers. With hard-block enabled the gateway will stop requests at the cap.',
    requiresApproval: false,
  };
}

// ── 4. A lower-cost model may be worth evaluating ───────────────────────────
export function modelEvaluationRule(p: {
  projectId: string;
  projectName: string;
  days: number;
  group: UsageGroup;
  best: Comparison;
}): RecommendationDraft | null {
  const t = THRESHOLDS.modelEvaluation;
  const c = p.best;
  const scale = 30 / p.days;
  const monthlyLow = c.savingsUsd.low * scale;
  const monthlyHigh = c.savingsUsd.high * scale;
  if (!c.eligible || p.group.requests < t.minRequests) return null;
  if ((c.savingsPercent.low ?? 0) < t.minSavingsPercentLow || monthlyLow < t.minMonthlySavingsLowUsd) return null;
  const uncertain = c.checks.some((x) => x.status === 'unknown' || x.status === 'warn');
  // Never "high": price says nothing about quality. "medium" only with substantial volume and history and clean checks.
  const confidence: Confidence = !uncertain && p.group.requests >= 500 && p.days >= 14 ? 'medium' : 'low';
  return {
    type: 'MODEL_EVALUATION',
    projectId: p.projectId,
    fingerprint: `MODEL_EVALUATION:${p.projectId}:${p.group.model}:${c.candidate.model}`,
    severity: 'info',
    title: `Consider evaluating ${c.candidate.model} for ${p.group.model} traffic in “${p.projectName}”`,
    summary: `Re-pricing the last ${p.days} days of ${p.group.model} traffic (${p.group.requests.toLocaleString('en-US')} requests) on ${c.candidate.model} would have cost ${usd(c.hypotheticalUsd.low)}–${usd(c.hypotheticalUsd.high)} instead of ${usd(p.group.actualCostUsd)}. This compares cost only; it says nothing about whether the answers would be as good.`,
    evidence: { days: p.days, current: p.group, comparison: c, monthlyScale: round(scale, 3) },
    method: 'Historical input/output token totals re-priced at the candidate\'s configured prices (low end: observed cache rate; high end: no caching plus any documented tokenizer difference). Savings are the difference to actual ledger spend, extrapolated linearly to 30 days.',
    impactLowUsd: round(monthlyLow),
    impactHighUsd: round(monthlyHigh),
    impactBasis: 'per month, if quality were acceptable (cost-only estimate)',
    confidence,
    action: `Run an offline quality evaluation of ${c.candidate.model} on a sample of your own prompts before changing anything. Approving this records a decision to evaluate; SpendGuard does not change any model configuration.`,
    requiresApproval: true,
  };
}

// ── 5. An application uses far more tokens per request than its peers ───────
export function highTokenApplicationRule(p: {
  projectId: string;
  projectName: string;
  days: number;
  apps: Array<{ application: string; requests: number; avgTokensPerRequest: number; costUsd: number; tokens: number }>;
}): RecommendationDraft | null {
  const t = THRESHOLDS.highTokenApp;
  const eligible = p.apps.filter((a) => a.requests >= t.minRequests);
  if (eligible.length < t.minApps) return null;
  const sorted = [...eligible].sort((a, b) => b.avgTokensPerRequest - a.avgTokensPerRequest);
  const top = sorted[0];
  const peers = sorted.slice(1);
  const peerMedian = median(peers.map((a) => a.avgTokensPerRequest));
  if (peerMedian <= 0 || top.avgTokensPerRequest < t.minRatioToPeers * peerMedian) return null;
  const usdPerToken = top.tokens > 0 ? top.costUsd / top.tokens : 0;
  const excessTokens = (top.avgTokensPerRequest - peerMedian) * top.requests;
  const excessUsd = excessTokens * usdPerToken;
  return {
    type: 'HIGH_TOKEN_APPLICATION',
    projectId: p.projectId,
    fingerprint: `HIGH_TOKEN_APPLICATION:${p.projectId}:${top.application}`,
    severity: 'info',
    title: `“${top.application}” uses ${(top.avgTokensPerRequest / peerMedian).toFixed(1)}× the tokens per request of its peers`,
    summary: `${top.application} averages ${Math.round(top.avgTokensPerRequest).toLocaleString('en-US')} tokens per request over ${top.requests.toLocaleString('en-US')} requests, versus a median of ${Math.round(peerMedian).toLocaleString('en-US')} for the other applications in “${p.projectName}”.`,
    evidence: { days: p.days, application: top, peerMedianTokensPerRequest: round(peerMedian, 1), peers: peers.map((a) => ({ application: a.application, requests: a.requests, avgTokensPerRequest: round(a.avgTokensPerRequest, 1) })), excessTokens: Math.round(excessTokens) },
    method: `Average tokens per request by application over ${p.days} days (applications with ≥ ${t.minRequests} requests). Flagged when the highest is ≥ ${t.minRatioToPeers}× the median of the others. Impact = tokens above the peer median × that application's own average cost per token.`,
    impactLowUsd: round(excessUsd),
    impactHighUsd: round(excessUsd),
    impactBasis: `over the last ${p.days} days; tokens above the peer median, not necessarily avoidable`,
    confidence: 'low',
    action: 'Check whether long prompts, large context or missing truncation explain it. A legitimately different workload may justify it.',
    requiresApproval: false,
  };
}
