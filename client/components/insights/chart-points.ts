import type { ForecastResponse } from '@/lib/insights';

interface Point {
  date: string;
  actual?: number;
  predicted?: number;
  band?: [number, number];
}

/** Actual spend (solid) and the forecast (dashed, with its range) are separate series and separate numbers. */
export function chartPoints(days: ForecastResponse['days']): Point[] {
  const out: Point[] = days.map((d) =>
    d.kind === 'actual'
      ? { date: d.date.slice(5), actual: d.cumulativeUsd }
      : { date: d.date.slice(5), predicted: d.cumulativeUsd, band: [d.cumulativeLowUsd ?? d.cumulativeUsd, d.cumulativeHighUsd ?? d.cumulativeUsd] as [number, number] },
  );
  // join the lines: the forecast starts from the last actual point
  const lastActual = [...out].reverse().find((p) => p.actual !== undefined);
  const firstForecast = out.findIndex((p) => p.predicted !== undefined);
  if (lastActual && firstForecast > 0) {
    const i = out.indexOf(lastActual);
    out[i] = { ...lastActual, predicted: lastActual.actual, band: [lastActual.actual!, lastActual.actual!] };
  }
  return out;
}
