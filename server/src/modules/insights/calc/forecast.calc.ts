/**
 * Deterministic month-end spend forecast. Pure functions: the same ledger totals always give the same numbers,
 * and no model, randomness or external data is involved.
 *
 * METHOD (also returned to the caller, so the UI can show it):
 *   observed days  = complete UTC days from max(month start, first day with ledger activity) up to yesterday
 *   burn           = spend of the observed days / number of observed days
 *   projected      = MTD actual + max(0, burn - spend so far today) + burn x (days remaining after today)
 *   range (~80%)   = projected +/- 1.28 x sd x sqrt(days still to come), clamped below at MTD actual
 *                    (sd = sample standard deviation of the observed daily spends; assumes independent days)
 *
 * It is a run-rate projection, not a model of seasonality, launches or price changes, and it says so.
 * Below 3 observed days there is NO projection (only actuals): an unreliable number is not shown as a fact.
 */

export type Sufficiency = 'insufficient' | 'low' | 'medium' | 'high';
export type BudgetStatus = 'insufficient_data' | 'on_track' | 'at_risk' | 'likely_exceed' | 'exceeded';

export interface DailySpend {
  /** UTC day, YYYY-MM-DD */
  date: string;
  spendUsd: number;
}

export interface ForecastInput {
  now: Date;
  /** Spend per UTC day for the current month; days with no ledger rows may be omitted. */
  daily: DailySpend[];
  /** UTC day (YYYY-MM-DD) of the first ledger row in scope, or null if there are none. */
  firstActivityDate: string | null;
  /** Monthly budget in USD, or null when the scope has none. */
  budgetUsd: number | null;
}

export interface ForecastDay {
  date: string;
  kind: 'actual' | 'forecast';
  /** The current day: actual so far, expected remainder shown in `expectedRestOfDayUsd`. */
  partial?: boolean;
  spendUsd: number;
  cumulativeUsd: number;
  /** Forecast days only. */
  cumulativeLowUsd?: number;
  cumulativeHighUsd?: number;
}

export interface ForecastResult {
  asOf: string;
  month: string;
  /** What actually happened. Always present. */
  actual: {
    monthToDateUsd: number;
    todaySoFarUsd: number;
    completedDaysUsd: number;
    observedDays: number;
    avgDailyBurnUsd: number | null;
    trailing7DayBurnUsd: number | null;
    dailyStdDevUsd: number | null;
  };
  /** What is PREDICTED. null when there is not enough history to say anything honest. */
  forecast: null | {
    projectedMonthEndUsd: number;
    lowUsd: number;
    highUsd: number;
    rangeCoverage: string;
    daysRemainingIncludingToday: number;
    expectedRestOfDayUsd: number;
  };
  sufficiency: Sufficiency;
  /** Why the sufficiency level is what it is, and what is missing. */
  sufficiencyNote: string;
  warnings: string[];
  budget: null | {
    budgetUsd: number;
    status: BudgetStatus;
    remainingUsd: number;
    percentUsed: number;
    /** First forecast day on which the projected cumulative spend reaches the budget (projection only). */
    projectedExceedDate: string | null;
    statusNote: string;
  };
  days: ForecastDay[];
  method: string;
}

const Z_80 = 1.2816;
const round = (n: number, d = 6) => Number(n.toFixed(d));
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export const FORECAST_METHOD =
  'Run-rate projection: month-to-date actual + average daily burn of the complete days observed so far × the days remaining. ' +
  'The range is ≈80% (±1.28σ of observed daily spend, assuming independent days). Seasonality, launches and price changes are not modelled.';

function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
}

export function sufficiencyForDays(observedDays: number): Sufficiency {
  if (observedDays < 3) return 'insufficient';
  if (observedDays < 7) return 'low';
  if (observedDays < 14) return 'medium';
  return 'high';
}

const LEVELS: Sufficiency[] = ['insufficient', 'low', 'medium', 'high'];
const downgrade = (s: Sufficiency): Sufficiency => (s === 'high' ? 'medium' : s === 'medium' ? 'low' : s);

export function computeForecast(input: ForecastInput): ForecastResult {
  const { now, budgetUsd } = input;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const today = dayKey(now);
  const monthLabel = `${year}-${String(month + 1).padStart(2, '0')}`;

  const spendByDay = new Map(input.daily.map((d) => [d.date, d.spendUsd]));
  const todaySoFar = spendByDay.get(today) ?? 0;

  // Observation window: from the first day with activity (never before the month start) to yesterday
  const first = input.firstActivityDate && input.firstActivityDate > dayKey(monthStart) ? input.firstActivityDate : dayKey(monthStart);
  const observed: DailySpend[] = [];
  if (input.firstActivityDate) {
    for (let d = new Date(`${first}T00:00:00Z`); dayKey(d) < today; d = addDays(d, 1)) {
      observed.push({ date: dayKey(d), spendUsd: spendByDay.get(dayKey(d)) ?? 0 });
    }
  }
  const observedDays = observed.length;
  const completedDaysUsd = observed.reduce((a, d) => a + d.spendUsd, 0);
  const monthToDate = [...spendByDay.entries()].filter(([d]) => d >= dayKey(monthStart) && d <= today).reduce((a, [, v]) => a + v, 0);

  const burn = observedDays > 0 ? completedDaysUsd / observedDays : null;
  const last7 = observed.slice(-7);
  const trailing7 = last7.length ? last7.reduce((a, d) => a + d.spendUsd, 0) / last7.length : null;
  const sd = observedDays >= 2 ? sampleStdDev(observed.map((d) => d.spendUsd)) : null;

  const warnings: string[] = [];
  let sufficiency = sufficiencyForDays(observedDays);
  if (burn !== null && burn > 0 && sd !== null && sd / burn > 1 && sufficiency !== 'insufficient') {
    sufficiency = downgrade(sufficiency);
    warnings.push('Daily spend is very uneven (standard deviation above the average), so the projection is less reliable.');
  }
  if (observedDays >= 3 && burn !== null && trailing7 !== null && burn > 0 && (trailing7 / burn > 1.5 || trailing7 / burn < 0.67)) {
    warnings.push(`The last ${last7.length} days average $${trailing7.toFixed(2)}/day versus $${burn.toFixed(2)}/day for the observed period: the run rate is changing, so month-end could differ materially.`);
  }

  const sufficiencyNote =
    sufficiency === 'insufficient'
      ? `Only ${observedDays} complete day${observedDays === 1 ? '' : 's'} of spend ${observedDays === 1 ? 'is' : 'are'} available; at least 3 are needed before a projection is shown.`
      : `Based on ${observedDays} complete day${observedDays === 1 ? '' : 's'} of spend. ${sufficiency === 'low' ? 'Treat as a rough guide.' : sufficiency === 'medium' ? 'Reasonable for planning, not for commitments.' : 'Two or more weeks of history.'}`;

  const remainingDays = daysInMonth - dayOfMonth + 1; // today included

  // ── Series: actual days (observed + today) ─────────────────────────────
  const days: ForecastDay[] = [];
  let cumulative = 0;
  for (const d of observed) {
    cumulative += d.spendUsd;
    days.push({ date: d.date, kind: 'actual', spendUsd: round(d.spendUsd), cumulativeUsd: round(cumulative) });
  }
  cumulative += todaySoFar;
  days.push({ date: today, kind: 'actual', partial: true, spendUsd: round(todaySoFar), cumulativeUsd: round(cumulative) });

  let forecast: ForecastResult['forecast'] = null;
  let expectedRest = 0;
  if (sufficiency !== 'insufficient' && burn !== null) {
    expectedRest = Math.max(0, burn - todaySoFar);
    const projected = monthToDate + expectedRest + burn * (remainingDays - 1);
    const spread = (n: number) => Z_80 * (sd ?? 0) * Math.sqrt(n);
    forecast = {
      projectedMonthEndUsd: round(projected, 4),
      lowUsd: round(Math.max(monthToDate, projected - spread(remainingDays)), 4),
      highUsd: round(projected + spread(remainingDays), 4),
      rangeCoverage: '≈80% (assumes independent days)',
      daysRemainingIncludingToday: remainingDays,
      expectedRestOfDayUsd: round(expectedRest, 4),
    };
    // Forecast days: tomorrow .. month end; the first step also carries the rest of today
    let projCum = monthToDate + expectedRest;
    for (let k = 1; k <= remainingDays - 1; k++) {
      projCum += burn;
      const n = 1 + k;
      days.push({
        date: dayKey(addDays(now, k)),
        kind: 'forecast',
        spendUsd: round(burn),
        cumulativeUsd: round(projCum),
        cumulativeLowUsd: round(Math.max(monthToDate, projCum - spread(n))),
        cumulativeHighUsd: round(projCum + spread(n)),
      });
    }
  }

  // ── Budget ─────────────────────────────────────────────────────────────
  let budget: ForecastResult['budget'] = null;
  if (budgetUsd !== null && budgetUsd > 0) {
    let status: BudgetStatus;
    let note: string;
    if (monthToDate >= budgetUsd) {
      status = 'exceeded';
      note = 'Spend this month has already reached the budget (actual, not a forecast).';
    } else if (!forecast) {
      status = 'insufficient_data';
      note = 'Not enough history to say whether the budget will be reached.';
    } else if (forecast.lowUsd >= budgetUsd) {
      status = 'likely_exceed';
      note = 'Even the low end of the projected range is above the budget.';
    } else if (forecast.projectedMonthEndUsd >= budgetUsd || forecast.highUsd >= budgetUsd) {
      status = 'at_risk';
      note = forecast.projectedMonthEndUsd >= budgetUsd ? 'The projection is above the budget.' : 'The projection is under the budget but the upper end of the range is above it.';
    } else {
      status = 'on_track';
      note = 'The whole projected range is under the budget.';
    }
    const exceedDay = forecast ? days.find((d) => d.kind === 'forecast' && d.cumulativeUsd >= budgetUsd) : undefined;
    budget = {
      budgetUsd,
      status,
      remainingUsd: round(Math.max(0, budgetUsd - monthToDate), 4),
      percentUsed: round((monthToDate / budgetUsd) * 100, 2),
      projectedExceedDate: status === 'exceeded' ? null : exceedDay?.date ?? null,
      statusNote: note,
    };
  }

  return {
    asOf: now.toISOString(),
    month: monthLabel,
    actual: {
      monthToDateUsd: round(monthToDate, 4),
      todaySoFarUsd: round(todaySoFar, 4),
      completedDaysUsd: round(completedDaysUsd, 4),
      observedDays,
      avgDailyBurnUsd: burn === null ? null : round(burn, 4),
      trailing7DayBurnUsd: trailing7 === null ? null : round(trailing7, 4),
      dailyStdDevUsd: sd === null ? null : round(sd, 4),
    },
    forecast,
    sufficiency,
    sufficiencyNote,
    warnings,
    budget,
    days,
    method: FORECAST_METHOD,
  };
}

/** For consumers that rank confidence (recommendations). */
export const sufficiencyRank = (s: Sufficiency) => LEVELS.indexOf(s);
