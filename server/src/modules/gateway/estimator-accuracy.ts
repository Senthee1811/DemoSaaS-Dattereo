/**
 * Policy for judging the token estimator (no prompts are ever involved: only counts that the ledger already stores).
 *
 * The estimator sizes RESERVATIONS. A reservation that is too small risks overrunning the budget; one that is too large
 * blocks traffic that would have fit. A provider margin may only be changed on evidence, so this module defines how much
 * evidence is "enough" and refuses to call anything conclusive below that. Margins are NEVER changed automatically.
 */
export const MIN_SAMPLES_PER_PROVIDER = 1000; // confirmed-usage rows, per provider and estimator version
export const MIN_SPAN_DAYS = 14; // the sample must cover at least two weeks (weekday/weekend and traffic mix)
export const MIN_SAMPLES_PER_MODEL = 200; // below this a per-model row is shown but flagged "indicative only"

export interface GroupStats {
  samples: number;
  underRawPct: number | null;
  /** Share of requests whose RESERVED input tokens (after the margin) were below the actual input tokens. */
  underReservedPct: number | null;
}

export interface MarginAssessment {
  sufficient: boolean;
  samples: number;
  requiredSamples: number;
  spanDays: number;
  requiredSpanDays: number;
  verdict: 'insufficient_data' | 'reservation_under_covers_input' | 'no_action_indicated';
  note: string;
}

export function assessMargin(input: { providerSamples: number; spanDays: number; underReservedPct: number | null }): MarginAssessment {
  const { providerSamples: samples, spanDays } = input;
  const base = { samples, requiredSamples: MIN_SAMPLES_PER_PROVIDER, spanDays: Math.round(spanDays * 10) / 10, requiredSpanDays: MIN_SPAN_DAYS };
  if (samples < MIN_SAMPLES_PER_PROVIDER || spanDays < MIN_SPAN_DAYS) {
    return { ...base, sufficient: false, verdict: 'insufficient_data', note: `Not enough evidence to change a margin: need at least ${MIN_SAMPLES_PER_PROVIDER} confirmed-usage requests over ${MIN_SPAN_DAYS} days (have ${samples} over ${base.spanDays}). Keep the current margin.` };
  }
  if ((input.underReservedPct ?? 0) > 1) {
    return { ...base, sufficient: true, verdict: 'reservation_under_covers_input', note: `${input.underReservedPct}% of requests used more input tokens than were reserved. Consider RAISING the margin (GATEWAY_ESTIMATE_MARGIN_<PROVIDER>) after reviewing which models/prompt shapes drive it.` };
  }
  return { ...base, sufficient: true, verdict: 'no_action_indicated', note: 'The reserved input tokens covered actual usage for at least 99% of requests. A lower margin is a business decision (it trades blocked traffic for overrun risk); this report does not recommend lowering it automatically.' };
}
