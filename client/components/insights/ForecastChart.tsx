'use client';

import React from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from '@/lib/chart-theme';
import { usd } from '@/lib/insights';
import { chartPoints } from './chart-points';
import type { ForecastResponse } from '@/lib/insights';

/** The recharts part of the forecast, in its own chunk (loaded only when "What's next" opens and a forecast exists). */
export default function ForecastChart({ days }: { days: ForecastResponse['days'] }) {
  const theme = useChartTheme();
  return (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints(days)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis dataKey="date" stroke={theme.axis} fontSize={11} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke={theme.axis} fontSize={11} tickLine={false} width={56} tickFormatter={(v) => usd(Number(v))} />
                <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.tooltipFg, borderRadius: 12, fontSize: 12 }} formatter={(v) => (Array.isArray(v) ? `${usd(Number(v[0]))} – ${usd(Number(v[1]))}` : usd(Number(v)))} />
                <Area type="monotone" dataKey="band" name="Forecast range" stroke="none" fill={theme.accent} fillOpacity={0.12} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={theme.accent} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="predicted" name="Forecast" stroke={theme.accent} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
  );
}
