import { computeForecast, DailySpend, sufficiencyForDays } from '../src/modules/insights/calc/forecast.calc';

/** Builds a month of daily spend: `values[i]` is the spend of day (startDay + i). */
const days = (startDay: number, values: number[], month = '2026-11'): DailySpend[] =>
  values.map((v, i) => ({ date: `${month}-${String(startDay + i).padStart(2, '0')}`, spendUsd: v }));

const NOW = new Date('2026-11-15T12:00:00Z'); // November has 30 days; today is day 15 → 16 days remain including today
const flat = (value: number, n = 14) => Array(n).fill(value) as number[];

describe('forecast: actuals are kept apart from the prediction', () => {
  const f = computeForecast({ now: NOW, daily: [...days(1, flat(10)), ...days(15, [4])], firstActivityDate: '2026-11-01', budgetUsd: null });

  it('reports month-to-date, today so far and the burn rate as ACTUAL figures', () => {
    expect(f.actual).toMatchObject({ completedDaysUsd: 140, todaySoFarUsd: 4, monthToDateUsd: 144, observedDays: 14, avgDailyBurnUsd: 10, trailing7DayBurnUsd: 10, dailyStdDevUsd: 0 });
  });

  it('projects month end = MTD + rest of today + burn × remaining days (hand-computed: 144 + 6 + 10×15 = 300)', () => {
    expect(f.forecast!.projectedMonthEndUsd).toBe(300);
    expect(f.forecast!.daysRemainingIncludingToday).toBe(16);
    expect(f.forecast!.expectedRestOfDayUsd).toBe(6);
    expect(f.forecast!.projectedMonthEndUsd).toBe(140 + 10 * 16); // identical to completed days + burn × days left incl. today
  });

  it('with perfectly steady spend the range collapses onto the projection', () => {
    expect(f.forecast!.lowUsd).toBe(300);
    expect(f.forecast!.highUsd).toBe(300);
  });

  it('the series labels every point actual or forecast, and the forecast line ends exactly on the headline number', () => {
    const actual = f.days.filter((d) => d.kind === 'actual');
    const fc = f.days.filter((d) => d.kind === 'forecast');
    expect(actual).toHaveLength(15); // 14 complete days + today
    expect(actual[actual.length - 1]).toMatchObject({ date: '2026-11-15', partial: true, cumulativeUsd: 144 });
    expect(fc).toHaveLength(15); // Nov 16 .. Nov 30
    expect(fc[0].date).toBe('2026-11-16');
    expect(fc[fc.length - 1].date).toBe('2026-11-30');
    expect(fc[fc.length - 1].cumulativeUsd).toBe(300);
    expect(fc.every((d) => d.spendUsd === 10)).toBe(true);
    expect(actual.every((d) => d.cumulativeLowUsd === undefined)).toBe(true); // actuals have no uncertainty band
  });

  it('states its method and that it is a run-rate projection', () => {
    expect(f.method).toMatch(/Run-rate projection/);
    expect(f.method).toMatch(/not modelled/);
  });
});

describe('forecast: the range reflects how uneven spend has been', () => {
  const alternating = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 5 : 15)); // mean 10, sample sd = sqrt(14×25/13)
  const sd = Math.sqrt((14 * 25) / 13);
  const f = computeForecast({ now: NOW, daily: [...days(1, alternating), ...days(15, [10])], firstActivityDate: '2026-11-01', budgetUsd: null });

  it('uses the sample standard deviation and ±1.28σ·√days (≈80%)', () => {
    expect(f.actual.dailyStdDevUsd).toBeCloseTo(sd, 3);
    const spread = 1.2816 * sd * Math.sqrt(16);
    expect(f.forecast!.projectedMonthEndUsd).toBeCloseTo(300, 3);
    expect(f.forecast!.highUsd).toBeCloseTo(300 + spread, 2);
    expect(f.forecast!.lowUsd).toBeCloseTo(300 - spread, 2);
    expect(f.forecast!.rangeCoverage).toMatch(/80%/);
  });

  it('the low end is never below what has already been spent (spend cannot go down)', () => {
    const tight = computeForecast({ now: new Date('2026-11-29T12:00:00Z'), daily: [...days(1, [1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40, 1, 40]), ...days(29, [3])], firstActivityDate: '2026-11-01', budgetUsd: null });
    expect(tight.forecast!.lowUsd).toBeGreaterThanOrEqual(tight.actual.monthToDateUsd);
  });

  it('forecast days carry a widening band', () => {
    const fc = f.days.filter((d) => d.kind === 'forecast');
    const widths = fc.map((d) => d.cumulativeHighUsd! - d.cumulativeLowUsd!);
    expect(widths[0]).toBeLessThan(widths[widths.length - 1]);
    expect(fc.every((d) => d.cumulativeLowUsd! <= d.cumulativeUsd && d.cumulativeUsd <= d.cumulativeHighUsd!)).toBe(true);
  });
});

describe('forecast: data sufficiency — no projection is shown as fact without enough history', () => {
  it.each([[0, 'insufficient'], [1, 'insufficient'], [2, 'insufficient'], [3, 'low'], [6, 'low'], [7, 'medium'], [13, 'medium'], [14, 'high'], [30, 'high']])('%i observed days → %s', (n, level) => {
    expect(sufficiencyForDays(n)).toBe(level);
  });

  it('2 observed days: NO projection, only actuals, with the reason', () => {
    const f = computeForecast({ now: NOW, daily: [...days(13, [8, 9]), ...days(15, [2])], firstActivityDate: '2026-11-13', budgetUsd: 100 });
    expect(f.sufficiency).toBe('insufficient');
    expect(f.forecast).toBeNull();
    expect(f.actual).toMatchObject({ observedDays: 2, monthToDateUsd: 19, avgDailyBurnUsd: 8.5 });
    expect(f.sufficiencyNote).toMatch(/at least 3/);
    expect(f.days.every((d) => d.kind === 'actual')).toBe(true);
    expect(f.budget!.status).toBe('insufficient_data');
  });

  it('observation starts at the first ACTIVE day, not the month start: a project created on day 10 is not "spending $0" for 9 days', () => {
    const f = computeForecast({ now: NOW, daily: [...days(10, [20, 20, 20, 20, 20]), ...days(15, [0])], firstActivityDate: '2026-11-10', budgetUsd: null });
    expect(f.actual.observedDays).toBe(5);
    expect(f.actual.avgDailyBurnUsd).toBe(20); // not 100/14
    expect(f.sufficiency).toBe('low');
  });

  it('a project whose first activity was in an earlier month is observed from the 1st of this month', () => {
    const f = computeForecast({ now: NOW, daily: days(1, flat(5)), firstActivityDate: '2026-09-02', budgetUsd: null });
    expect(f.actual.observedDays).toBe(14);
  });

  it('no ledger rows at all: nothing observed, no projection, zeros are not invented as a burn rate', () => {
    const f = computeForecast({ now: NOW, daily: [], firstActivityDate: null, budgetUsd: 50 });
    expect(f.actual).toMatchObject({ monthToDateUsd: 0, observedDays: 0, avgDailyBurnUsd: null });
    expect(f.forecast).toBeNull();
    expect(f.sufficiency).toBe('insufficient');
  });

  it('first day of the month: nothing complete yet, so no projection even with history from earlier months', () => {
    const f = computeForecast({ now: new Date('2026-11-01T09:00:00Z'), daily: days(1, [3]), firstActivityDate: '2026-08-01', budgetUsd: null });
    expect(f.actual.observedDays).toBe(0);
    expect(f.forecast).toBeNull();
  });

  it('very uneven spend downgrades the level and says why', () => {
    const spiky = [0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0]; // sd far above the mean
    const f = computeForecast({ now: NOW, daily: [...days(1, spiky), ...days(15, [0])], firstActivityDate: '2026-11-01', budgetUsd: null });
    expect(f.sufficiency).toBe('medium'); // 14 days would be "high"
    expect(f.warnings.join(' ')).toMatch(/very uneven/);
  });

  it('warns when the recent run rate has moved away from the observed average', () => {
    const f = computeForecast({ now: NOW, daily: [...days(1, [...flat(5, 7), ...flat(30, 7)]), ...days(15, [0])], firstActivityDate: '2026-11-01', budgetUsd: null });
    expect(f.actual.trailing7DayBurnUsd).toBe(30);
    expect(f.warnings.join(' ')).toMatch(/run rate is changing/);
  });
});

describe('forecast: budget status', () => {
  const run = (budgetUsd: number, daily = [...days(1, flat(10)), ...days(15, [4])]) => computeForecast({ now: NOW, daily, firstActivityDate: '2026-11-01', budgetUsd });

  it('exceeded — an ACTUAL fact once month-to-date reaches the budget', () => {
    const b = run(100).budget!;
    expect(b.status).toBe('exceeded');
    expect(b.remainingUsd).toBe(0);
    expect(b.statusNote).toMatch(/actual, not a forecast/);
    expect(b.projectedExceedDate).toBeNull();
  });

  it('likely_exceed — even the LOW end of the range is above the budget', () => {
    expect(run(250).budget!.status).toBe('likely_exceed');
  });

  it('projected exceed date: the first forecast day on which the cumulative projection reaches the budget (hand-computed: 150 + 10×10 = 250 → Nov 25)', () => {
    expect(run(250).budget!.projectedExceedDate).toBe('2026-11-25');
  });

  it('at_risk — projection under the budget but the upper end of the range is over it', () => {
    const alternating = Array.from({ length: 14 }, (_, i) => (i % 2 === 0 ? 5 : 15));
    const f = computeForecast({ now: NOW, daily: [...days(1, alternating), ...days(15, [10])], firstActivityDate: '2026-11-01', budgetUsd: 310 });
    expect(f.forecast!.projectedMonthEndUsd).toBeLessThan(310);
    expect(f.forecast!.highUsd).toBeGreaterThan(310);
    expect(f.budget!.status).toBe('at_risk');
  });

  it('on_track — the whole range is under the budget', () => {
    expect(run(1000).budget!.status).toBe('on_track');
  });

  it('reports percent used and remaining from ACTUAL spend only', () => {
    const b = run(400).budget!;
    expect(b.percentUsed).toBe(36); // 144 / 400
    expect(b.remainingUsd).toBe(256);
  });

  it('no budget configured → no budget block (nothing is compared against an invented limit)', () => {
    expect(computeForecast({ now: NOW, daily: days(1, flat(10)), firstActivityDate: '2026-11-01', budgetUsd: null }).budget).toBeNull();
    expect(computeForecast({ now: NOW, daily: days(1, flat(10)), firstActivityDate: '2026-11-01', budgetUsd: 0 }).budget).toBeNull();
  });
});

describe('forecast: calendar edge cases', () => {
  it('February in a leap year has 29 days (20 remain from the 10th including today)', () => {
    const f = computeForecast({ now: new Date('2028-02-10T08:00:00Z'), daily: days(1, flat(10, 9), '2028-02'), firstActivityDate: '2028-02-01', budgetUsd: null });
    expect(f.forecast!.daysRemainingIncludingToday).toBe(20);
    expect(f.days.filter((d) => d.kind === 'forecast').pop()!.date).toBe('2028-02-29');
    expect(f.month).toBe('2028-02');
  });

  it('on the last day nothing remains after today: projection = MTD plus the rest of today', () => {
    const f = computeForecast({ now: new Date('2026-11-30T20:00:00Z'), daily: [...days(1, flat(10, 29)), ...days(30, [7])], firstActivityDate: '2026-11-01', budgetUsd: null });
    expect(f.forecast!.daysRemainingIncludingToday).toBe(1);
    expect(f.actual.monthToDateUsd).toBe(297); // 29 days × 10 + 7 so far today
    expect(f.forecast!.projectedMonthEndUsd).toBe(300); // 297 + (10 − 7) for the rest of today, nothing after
    expect(f.days.filter((d) => d.kind === 'forecast')).toHaveLength(0);
  });

  it('spend already above the daily average today adds nothing for the rest of today (never negative)', () => {
    const f = computeForecast({ now: NOW, daily: [...days(1, flat(10)), ...days(15, [25])], firstActivityDate: '2026-11-01', budgetUsd: null });
    expect(f.forecast!.expectedRestOfDayUsd).toBe(0);
    expect(f.forecast!.projectedMonthEndUsd).toBe(140 + 25 + 10 * 15);
  });

  it('the projection is never below spend that has already happened', () => {
    const f = computeForecast({ now: NOW, daily: [...days(1, flat(1)), ...days(15, [500])], firstActivityDate: '2026-11-01', budgetUsd: null });
    expect(f.forecast!.projectedMonthEndUsd).toBeGreaterThanOrEqual(f.actual.monthToDateUsd);
  });
});

describe('forecast: determinism', () => {
  it('the same ledger totals always give exactly the same numbers', () => {
    const input = { now: NOW, daily: [...days(1, [3, 9, 4, 12, 7, 5, 8, 6, 10, 2, 11, 9, 4, 7]), ...days(15, [3])], firstActivityDate: '2026-11-01', budgetUsd: 200 };
    expect(JSON.stringify(computeForecast(input))).toBe(JSON.stringify(computeForecast({ ...input, daily: [...input.daily] })));
  });
});
