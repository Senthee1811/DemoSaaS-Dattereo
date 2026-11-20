/**
 * Billing periods are always UTC. Never use getMonth()/getFullYear()/new Date(y, m, d)
 * for budgets or spend: on a server outside UTC they put requests near midnight
 * into the wrong month.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM' of the UTC month containing `at`. */
export function utcMonthKey(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${pad2(at.getUTCMonth() + 1)}`;
}

/** 00:00:00 UTC on the first day of the month containing `at`. */
export function utcMonthStart(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** 00:00:00 UTC on the first day of the following month. */
export function utcNextMonthStart(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}

/** 00:00:00 UTC on the Monday of the ISO week containing `at`. */
export function utcIsoWeekStart(at: Date = new Date()): Date {
  const day = at.getUTCDay() || 7; // Mon=1 … Sun=7
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - (day - 1)));
}

/** 00:00:00 UTC on the Monday after the ISO week containing `at`. */
export function utcNextIsoWeekStart(at: Date = new Date()): Date {
  const start = utcIsoWeekStart(at);
  return new Date(start.getTime() + 7 * 86400_000);
}

/** ISO-8601 week key 'YYYY-Www' (ISO week-numbering year) in UTC. */
export function utcIsoWeekKey(at: Date = new Date()): string {
  // The Thursday of this ISO week decides the ISO year.
  const monday = utcIsoWeekStart(at);
  const thursday = new Date(monday.getTime() + 3 * 86400_000);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week1Monday = utcIsoWeekStart(jan4);
  const week = Math.round((monday.getTime() - week1Monday.getTime()) / (7 * 86400_000)) + 1;
  return `${isoYear}-W${pad2(week)}`;
}

/** Seconds from `at` until `end`, plus a buffer (default one day) — for Redis key TTLs. */
export function ttlUntil(end: Date, at: Date = new Date(), bufferSec = 86400): number {
  return Math.max(1, Math.ceil((end.getTime() - at.getTime()) / 1000)) + bufferSec;
}
