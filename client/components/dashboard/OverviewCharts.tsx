'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DailySpendPoint } from '@/lib/types';
import { useScopeId } from '@/lib/scope';
import { usageHref } from '@/lib/usage-route';
import { useChartTheme } from '@/lib/chart-theme';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Badge } from '@/components/ui/Badge';

export interface PieSlice {
  name: string;
  provider?: string;
  value: number;
  color: string;
}

type TooltipValue = number | string | ReadonlyArray<number | string> | undefined;
const formatUsd = (val: TooltipValue) => `$${Number(Array.isArray(val) ? val[0] : val).toFixed(4)}`;

interface OverviewChartsProps {
  dailySpend: DailySpendPoint[];
  pieData: PieSlice[];
  totalSpend: number;
  onNavigateToPlayground: () => void;
}

export function OverviewCharts({
  dailySpend,
  pieData,
  totalSpend,
  onNavigateToPlayground,
}: OverviewChartsProps) {
  const router = useRouter();
  const scopeId = useScopeId();
  const chart = useChartTheme();

  // Both charts navigate to the same detailed-usage route; only the target differs. The project
  // in the URL is the global Scope at the moment of the click.
  const openDay = (day: string) => router.push(usageHref(scopeId, { metric: 'daily', day }));
  const openModel = (model: string) => router.push(usageHref(scopeId, { metric: 'model', model }));

  // Clicking a point/bar selects its day. activeTooltipIndex is the hovered data index.
  const handleChartClick = (state: { activeTooltipIndex?: number | string | null; activeLabel?: number | string }) => {
    const idx = Number(state?.activeTooltipIndex);
    const point = Number.isInteger(idx) ? dailySpend[idx] : dailySpend.find((p) => p.date === state?.activeLabel);
    if (point) openDay(point.date);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Daily Spend Velocity Chart (8 cols) */}
      <div className="lg:col-span-8 bg-surface p-6 rounded-card border border-line shadow-2xs">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-normal text-fg tracking-tight">Daily Spend Velocity</h3>
              <p className="text-xs text-fg-secondary mt-0.5">30-day trailing inference expenditure · click a day for its detailed usage</p>
            </div>
            <div className="flex items-center gap-2">
              {dailySpend.length > 0 && (
                <select
                  aria-label="Inspect the requests of a day"
                  value=""
                  onChange={(e) => e.target.value && openDay(e.target.value)}
                  className="text-label font-mono text-fg-secondary bg-surface px-2.5 py-1 rounded-full border border-line cursor-pointer"
                >
                  <option value="">Inspect a day…</option>
                  {[...dailySpend].reverse().map((p) => (
                    <option key={p.date} value={p.date}>{p.date} · {p.requests} req</option>
                  ))}
                </select>
              )}
              <Badge mono>UTC Daily Buckets</Badge>
            </div>
          </div>

          {dailySpend.length < 1 ? (
            <EmptyState
              icon={BarChart3}
              title="No spend recorded yet"
              description="Inference requests via the gateway will display daily cost velocity here."
              actionText="Open Test Bench"
              onAction={onNavigateToPlayground}
              compact
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={dailySpend}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  onClick={handleChartClick}
                  style={{ cursor: 'pointer' }}
                >
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chart.accent} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={chart.accent} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke={chart.axis}
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: chart.line }}
                  />
                  <YAxis
                    stroke={chart.axis}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chart.tooltipBg,
                      borderColor: chart.tooltipBorder,
                      borderRadius: 'var(--radius-menu)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      fontSize: '12px',
                      color: chart.tooltipFg
                    }}
                    formatter={(val: TooltipValue) => [formatUsd(val), 'Cost']}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke={chart.accent}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#spendGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Spend by Model (4 cols) */}
      <div className="lg:col-span-4 bg-surface p-6 rounded-card border border-line shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-normal text-fg tracking-tight">Cost by Model</h3>
              <p className="text-xs text-fg-secondary mt-0.5">Relative expenditure</p>
            </div>
          </div>

          {pieData.length === 0 || totalSpend === 0 ? (
            <EmptyState
              icon={PieIcon}
              title="No spend recorded yet"
              description="Model distribution updates automatically with gateway usage."
              compact
            />
          ) : (
            <div className="space-y-4">
              <div className="h-44 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      onClick={(slice: { name?: string }) => slice?.name && openModel(slice.name)}
                      style={{ cursor: 'pointer' }}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chart.tooltipBg,
                        borderColor: chart.tooltipBorder,
                        borderRadius: 'var(--radius-menu)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        fontSize: '12px',
                        color: chart.tooltipFg
                      }}
                      formatter={(val: TooltipValue) => [formatUsd(val), 'Spend']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-2 pt-2 border-t border-line">
                {pieData.map((m) => {
                  const pct = totalSpend > 0 ? ((m.value / totalSpend) * 100).toFixed(1) : '0.0';
                  return (
                    <button
                      type="button"
                      key={m.name}
                      onClick={() => openModel(m.name)}
                      aria-label={`Show requests for ${m.name}`}
                      className="w-full flex items-center justify-between text-xs rounded-control px-1.5 py-1 -mx-1.5 hover:bg-surface-muted text-left"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        {m.provider && <ProviderLogo provider={m.provider} size={12} className="text-fg-secondary" />}
                        <span className="font-mono text-fg truncate" title={m.name}>{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0">
                        <span className="text-fg-secondary">${m.value.toFixed(4)}</span>
                        <span className="text-label font-semibold text-fg">({pct}%)</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

