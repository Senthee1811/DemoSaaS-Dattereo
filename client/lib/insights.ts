/**
 * Types and presentation helpers for the Cost Insights section. The numbers all come from the backend
 * (deterministic ledger calculations); nothing here computes a financial figure. These helpers only decide how
 * to LABEL and FORMAT what the API returns, so that actual, predicted and unknown never look alike.
 */

export type Sufficiency = 'insufficient' | 'low' | 'medium' | 'high';
export type BudgetStatus = 'insufficient_data' | 'on_track' | 'at_risk' | 'likely_exceed' | 'exceeded';
export type Dimension = 'model' | 'project' | 'key' | 'application' | 'team' | 'provider';

export interface AttributionRow {
  key: string | null;
  label: string;
  unattributed: boolean;
  costUsd: number;
  share: number;
  requests: number;
  tokens: number;
  tokensPerRequest: number;
  costPerRequestUsd: number;
}

export interface AttributionResponse {
  dimension: Dimension;
  totals: { costUsd: number; requests: number; tokens: number };
  rows: AttributionRow[];
  coverage: { attributedShare: number | null; unattributedUsd: number; note: string | null };
  howToAttribute: { keyLevel: string; headers: Record<string, string>; precedence: string } | null;
}

export interface ForecastDay {
  date: string;
  kind: 'actual' | 'forecast';
  partial?: boolean;
  spendUsd: number;
  cumulativeUsd: number;
  cumulativeLowUsd?: number;
  cumulativeHighUsd?: number;
}

export interface ForecastResponse {
  month: string;
  actual: {
    monthToDateUsd: number;
    todaySoFarUsd: number;
    observedDays: number;
    avgDailyBurnUsd: number | null;
    trailing7DayBurnUsd: number | null;
  };
  forecast: null | { projectedMonthEndUsd: number; lowUsd: number; highUsd: number; rangeCoverage: string; daysRemainingIncludingToday: number };
  sufficiency: Sufficiency;
  sufficiencyNote: string;
  warnings: string[];
  budget: null | { budgetUsd: number; status: BudgetStatus; remainingUsd: number; percentUsed: number; projectedExceedDate: string | null; statusNote: string };
  days: ForecastDay[];
  method: string;
}

export interface Explanation {
  id: string;
  kind: string;
  text: string;
  evidence: { requestIds: string[]; dimension?: string; member?: string | null; basis: string };
}

export interface Contributor {
  key: string | null;
  label: string;
  windowCostUsd: number;
  baselineCostUsd: number;
  deltaUsd: number;
  shareOfChange: number | null;
  isNew: boolean;
}

export interface EvidenceRequest {
  id: string;
  at: string;
  model: string;
  provider: string;
  application: string | null;
  team: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  anomalyStatus: string;
}

export interface InvestigationResponse {
  window: { from: string; to: string; hours: number };
  baseline: { days: number; daysWithSpend: number };
  decomposition: {
    status: 'ok' | 'no_baseline';
    baselineSpendUsd: number;
    windowSpendUsd: number;
    deltaUsd: number;
    effects: { requestVolume: number; tokensPerRequest: number; pricePerToken: number } | null;
    dominant: 'requestVolume' | 'tokensPerRequest' | 'pricePerToken' | null;
    note?: string;
  };
  contributors: Record<string, Contributor[]>;
  changePoint: null | { startedAt: string; bucketCostUsd: number; baselineMeanUsd: number };
  sufficiency: Sufficiency;
  evidence: { topRequests: EvidenceRequest[]; anomalies: EvidenceRequest[] };
  explanations: Explanation[];
  method: string;
}

export interface Recommendation {
  id: string;
  type: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'APPROVED_FOR_EVALUATION' | 'DISMISSED' | 'RESOLVED';
  severity: 'info' | 'warning' | 'critical';
  projectName: string | null;
  title: string;
  summary: string;
  evidence: unknown;
  method: string;
  impact: null | { lowUsd: number; highUsd: number; basis: string | null };
  confidence: 'low' | 'medium' | 'high';
  action: string;
  requiresApproval: boolean;
  lastSeenAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ComparisonCheck {
  id: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  detail: string;
}

export interface ModelComparison {
  candidate: { model: string; provider: string };
  hypotheticalUsd: { low: number; high: number };
  savingsUsd: { low: number; high: number };
  savingsPercent: { low: number | null; high: number | null };
  assumptions: string[];
  checks: ComparisonCheck[];
  eligible: boolean;
}

export interface ModelComparisonResponse {
  range: { days: number };
  sources: Array<{
    usage: { model: string; provider: string; requests: number; actualCostUsd: number };
    distribution: { input: { avg: number; p95: number; max: number }; output: { avg: number; p95: number; max: number } };
    comparisons: ModelComparison[];
  }>;
  disclaimer: string;
  notAssessed: string[];
  gatewayLimitations: string[];
}

// ── Presentation ─────────────────────────────────────────────────────────────

/** Money with the precision that matters at that size: cents above $100, 4 decimals for tiny per-request amounts. */
const digitsFor = (abs: number) => (abs >= 100 ? 0 : abs >= 1 ? 2 : abs === 0 ? 2 : 4);
const fmtUsd = (n: number, digits: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return fmtUsd(n, digitsFor(Math.abs(n)));
}

/** A range with ONE precision for both ends ("$80.00–$120.00", never "$80.00–$120"). A single figure when the ends are equal. */
export function usdRange(low: number, high: number, sep = '–'): string {
  if (Math.abs(low - high) < 0.005) return usd(low);
  const d = Math.max(digitsFor(Math.abs(low)), digitsFor(Math.abs(high)));
  return `${fmtUsd(low, d)}${sep}${fmtUsd(high, d)}`;
}

export function signedUsd(n: number): string {
  return `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;
}

export function pct(share: number | null | undefined, digits = 0): string {
  return share === null || share === undefined ? '—' : `${(share * 100).toFixed(digits)}%`;
}

export const SUFFICIENCY_LABEL: Record<Sufficiency, string> = {
  insufficient: 'Not enough data',
  low: 'Low confidence',
  medium: 'Moderate confidence',
  high: 'Good history',
};

export const BUDGET_STATUS: Record<BudgetStatus, { label: string; tone: 'success' | 'warning' | 'critical' | 'neutral' }> = {
  on_track: { label: 'On track', tone: 'success' },
  at_risk: { label: 'At risk', tone: 'warning' },
  likely_exceed: { label: 'Likely to exceed', tone: 'critical' },
  exceeded: { label: 'Budget reached', tone: 'critical' },
  insufficient_data: { label: 'Not enough data to tell', tone: 'neutral' },
};

export const SEVERITY_TONE: Record<Recommendation['severity'], 'info' | 'warning' | 'critical'> = { info: 'info', warning: 'warning', critical: 'critical' };

export const DRIVER_LABEL = {
  requestVolume: 'Request volume',
  tokensPerRequest: 'Tokens per request',
  pricePerToken: 'Price per token (model mix & pricing)',
} as const;

export const DIMENSIONS: Array<{ id: Dimension; label: string }> = [
  { id: 'model', label: 'Model' },
  { id: 'project', label: 'Project' },
  { id: 'key', label: 'Gateway key' },
  { id: 'application', label: 'Application' },
  { id: 'team', label: 'Team' },
  { id: 'provider', label: 'Provider' },
];

/** "$12–$40 per month" / "$12 over the last 7 days": the range and what it covers, never one bare number. */
export function impactText(impact: Recommendation['impact']): string | null {
  if (!impact) return null;
  const range = usdRange(impact.lowUsd, impact.highUsd);
  return impact.basis ? `${range} ${impact.basis}` : range;
}

/** Evidence shown to the user: the stored object, pretty-printed and bounded so a huge payload cannot flood the page. */
export function evidenceText(evidence: unknown, max = 6000): string {
  const text = JSON.stringify(evidence, null, 2) ?? '';
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text;
}
