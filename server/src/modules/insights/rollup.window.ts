/**
 * Splits a query window into the part a daily rollup can answer exactly (whole UTC days that are fully materialized)
 * and the raw-ledger edges (a partial first day, the current day, anything not yet materialized).
 * Pure and exhaustively unit-tested: this is where "rollup totals equal raw totals" is decided.
 */
const DAY = 86_400_000;
export const dayStart = (d: Date) => new Date(Math.floor(d.getTime() / DAY) * DAY);
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface WindowSplit {
  /** Whole UTC days [from, to) served by the rollup, or null when none qualify. */
  rollup: { from: Date; to: Date } | null;
  /** Raw-ledger ranges [from, to) that must be read from `requests`. Together with `rollup` they tile the window exactly. */
  raw: Array<{ from: Date; to: Date }>;
}

/** `completeThrough` is the last UTC day (as a Date at midnight) that is materialized; null disables the rollup. */
export function splitWindow(from: Date, to: Date, completeThrough: Date | null): WindowSplit {
  if (!(from < to)) return { rollup: null, raw: [] };
  if (!completeThrough) return { rollup: null, raw: [{ from, to }] };
  const boundary = new Date(dayStart(completeThrough).getTime() + DAY); // first day NOT materialized
  const firstWhole = from.getTime() === dayStart(from).getTime() ? from : new Date(dayStart(from).getTime() + DAY);
  const lastWhole = new Date(Math.min(dayStart(to).getTime(), boundary.getTime()));
  if (!(firstWhole < lastWhole)) return { rollup: null, raw: [{ from, to }] };
  const raw: Array<{ from: Date; to: Date }> = [];
  if (from < firstWhole) raw.push({ from, to: firstWhole });
  if (lastWhole < to) raw.push({ from: lastWhole, to });
  return { rollup: { from: firstWhole, to: lastWhole }, raw };
}
