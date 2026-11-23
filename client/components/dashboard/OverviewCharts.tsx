'use client';

import React, { useState } from 'react';
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
import { DayRequestsPanel } from './DayRequestsPanel';

export interface PieSlice {
  name: string;
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
  // The UTC day ("YYYY-MM-DD") whose individual requests are open in the side panel
  const [openDay, setOpenDay] = useState<string | null>(null);

  // Clicking a point/bar selects its day. activeTooltipIndex is the hovered data index.
  const handleChartClick = (state: { activeTooltipIndex?: number | string | null; activeLabel?: number | string }) => {
    const idx = Number(state?.activeTooltipIndex);
    const point = Number.isInteger(idx) ? dailySpend[idx] : dailySpend.find((p) => p.date === state?.activeLabel);
    if (point) setOpenDay(point.date);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {openDay && <DayRequestsPanel day={openDay} onClose={() => setOpenDay(null)} />}
      {/* Daily Spend Velocity Chart (8 cols) */}
      <div className="lg:col-span-8 bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-normal text-[#141413] tracking-tight">Daily Spend Velocity</h3>
              <p className="text-xs text-[#5F6368] mt-0.5">30-day trailing inference expenditure · click a day to see its requests</p>
            </div>
            <div className="flex items-center gap-2">
              {dailySpend.length > 0 && (
                <select
                  aria-label="Inspect the requests of a day"
                  value=""
                  onChange={(e) => e.target.value && setOpenDay(e.target.value)}
                  className="text-label font-mono text-[#5F6368] bg-white px-2.5 py-1 rounded-full border border-[#E4E4E0] cursor-pointer"
                >
                  <option value="">Inspect a day…</option>
                  {[...dailySpend].reverse().map((p) => (
                    <option key={p.date} value={p.date}>{p.date} · {p.requests} req</option>
                  ))}
                </select>
              )}
              <span className="text-label font-mono text-[#80868B] bg-[#FAF8F5] px-2.5 py-1 rounded-full border border-[#E4E4E0]">
                UTC Daily Buckets
              </span>
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
                      <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#FF6B35" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECECE8" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#80868B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: '#E4E4E0' }}
                  />
                  <YAxis
                    stroke="#80868B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E4E4E0',
                      borderRadius: '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      fontSize: '12px',
                      color: '#141413'
                    }}
                    formatter={(val: TooltipValue) => [formatUsd(val), 'Cost']}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#FF6B35"
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
      <div className="lg:col-span-4 bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif text-lg font-normal text-[#141413] tracking-tight">Cost by Model</h3>
              <p className="text-xs text-[#5F6368] mt-0.5">Relative expenditure</p>
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
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E4E4E0',
                        borderRadius: '16px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                        fontSize: '12px',
                        color: '#141413'
                      }}
                      formatter={(val: TooltipValue) => [formatUsd(val), 'Spend']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-2 pt-2 border-t border-[#ECECE8]">
                {pieData.map((m) => {
                  const pct = totalSpend > 0 ? ((m.value / totalSpend) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={m.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <span className="font-mono text-[#141413] truncate">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums text-xs shrink-0">
                        <span className="text-[#5F6368]">${m.value.toFixed(4)}</span>
                        <span className="text-label font-semibold text-[#141413]">({pct}%)</span>
                      </div>
                    </div>
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

