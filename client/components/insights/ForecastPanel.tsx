'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '@/lib/use-api';
import { useChartTheme } from '@/lib/chart-theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { InlineAlert } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { BUDGET_STATUS, ForecastResponse, SUFFICIENCY_LABEL, usd } from '@/lib/insights';
import { CARD, q } from './shared';

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

export function ForecastPanel({ projectId }: { projectId: string }) {
  const { data, error, loading } = useApi<ForecastResponse>(`/api/v1/insights/forecast?${q(projectId)}`);
  const theme = useChartTheme();

  if (error) return <InlineAlert variant="error" title="Could not load the forecast">{error}</InlineAlert>;
  if (!data) return loading ? <CardSkeleton /> : null;
  if (data.actual.monthToDateUsd === 0 && data.actual.observedDays === 0) {
    return <EmptyState icon={CalendarClock} title="Nothing to forecast yet" description="Once requests have been billed for a few days, the month-end projection appears here." compact />;
  }

  const b = data.budget;
  const status = b ? BUDGET_STATUS[b.status] : null;
  const f = data.forecast;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={CARD}>
          <p className="text-label font-mono uppercase tracking-wider text-fg-muted flex items-center gap-2">Spent this month <Badge tone="neutral">Actual</Badge></p>
          <p className="mt-2 font-serif text-3xl text-fg tabular-nums" data-testid="forecast-actual">{usd(data.actual.monthToDateUsd)}</p>
          <p className="mt-2 text-label text-fg-secondary tabular-nums">
            {data.actual.avgDailyBurnUsd !== null ? `${usd(data.actual.avgDailyBurnUsd)}/day average over ${data.actual.observedDays} complete days` : 'No complete day yet'}
          </p>
        </div>

        <div className={CARD}>
          <p className="text-label font-mono uppercase tracking-wider text-fg-muted flex items-center gap-2">Projected month end <Badge tone="info">Forecast</Badge></p>
          {f ? (
            <>
              <p className="mt-2 font-serif text-3xl text-fg tabular-nums" data-testid="forecast-projected">{usd(f.projectedMonthEndUsd)}</p>
              <p className="mt-2 text-label text-fg-secondary tabular-nums" data-testid="forecast-range">
                Likely between {usd(f.lowUsd)} and {usd(f.highUsd)} ({f.rangeCoverage})
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 font-serif text-2xl text-fg-muted" data-testid="forecast-unavailable">Not enough data</p>
              <p className="mt-2 text-label text-fg-secondary">No projection is shown rather than an unreliable one.</p>
            </>
          )}
        </div>

        <div className={CARD}>
          <p className="text-label font-mono uppercase tracking-wider text-fg-muted">Budget</p>
          {b && status ? (
            <>
              <p className="mt-2 flex items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="text-xs text-fg-secondary tabular-nums">{b.percentUsed.toFixed(0)}% of {usd(b.budgetUsd)} used</span>
              </p>
              <p className="mt-2 text-label text-fg-secondary">{b.statusNote}</p>
              {b.projectedExceedDate && <p className="mt-1 text-label text-fg-secondary">At this rate it is reached around {b.projectedExceedDate} (projection).</p>}
            </>
          ) : (
            <p className="mt-2 text-label text-fg-secondary">No monthly budget is set for this scope.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-label text-fg-secondary">
        <Badge tone={data.sufficiency === 'insufficient' || data.sufficiency === 'low' ? 'warning' : 'success'}>{SUFFICIENCY_LABEL[data.sufficiency]}</Badge>
        <span>{data.sufficiencyNote}</span>
      </div>
      {data.warnings.map((w) => (
        <InlineAlert key={w} variant="warning" title="Take this forecast with care">{w}</InlineAlert>
      ))}

      {f && (
        <div className={CARD}>
          <p className="text-label font-mono uppercase tracking-wider text-fg-muted mb-3">Cumulative spend this month</p>
          <div className="h-64" role="img" aria-label="Cumulative spend this month: actual to date, then the forecast with its range">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints(data.days)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="date" stroke={theme.axis} fontSize={11} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke={theme.axis} fontSize={11} tickLine={false} width={56} tickFormatter={(v) => usd(Number(v))} />
                <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipFg, borderRadius: 12, fontSize: 12 }} formatter={(v) => (Array.isArray(v) ? `${usd(Number(v[0]))} – ${usd(Number(v[1]))}` : usd(Number(v)))} />
                <Area type="monotone" dataKey="band" name="Forecast range" stroke="none" fill={theme.accent} fillOpacity={0.12} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="predicted" name="Forecast" stroke={theme.accent} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-caption text-fg-muted">Solid line: actual spend. Dashed line and shaded band: forecast and its range.</p>
        </div>
      )}

      <details className="text-label text-fg-secondary">
        <summary className="cursor-pointer font-semibold">How this is calculated</summary>
        <p className="mt-2 max-w-3xl">{data.method}</p>
      </details>
    </div>
  );
}
