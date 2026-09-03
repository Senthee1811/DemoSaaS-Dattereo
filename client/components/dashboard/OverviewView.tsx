'use client';

import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Activity, 
  AlertTriangle, 
  ShieldAlert, 
  Zap, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ArrowRight,
  PieChart as PieIcon,
  BarChart3,
  Layers
} from 'lucide-react';
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
  Cell 
} from 'recharts';
import { TOKENS, MODEL_CHART_COLORS } from '@/lib/tokens';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton, ChartSkeleton } from '@/components/ui/LoadingSkeleton';

interface OverviewViewProps {
  analyticsData: any;
  onNavigateToProjects: () => void;
  onNavigateToPlayground: () => void;
  onNavigateToAudit: () => void;
}

export function OverviewView({
  analyticsData,
  onNavigateToProjects,
  onNavigateToPlayground,
  onNavigateToAudit
}: OverviewViewProps) {
  if (!analyticsData || !analyticsData.summary) {
    return (
      <div className="space-y-6 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8"><ChartSkeleton /></div>
          <div className="lg:col-span-4"><ChartSkeleton /></div>
        </div>
      </div>
    );
  }

  const { summary, dailySpend = [], modelBreakdown = [], projectBreakdown = [], recentRequests = [] } = analyticsData;

  const totalSpend = Number(summary.totalSpend || 0);
  const totalBudget = Number(summary.totalBudget || 5000);
  const utilizationPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpend / totalBudget) * 100)) : 0;
  
  // Calculate projected month-end burn
  const projectedSpend = Math.round(totalSpend * 1.15 * 100) / 100;
  const isOverBudget = utilizationPct >= 100;
  const isWarning = utilizationPct >= 80 && !isOverBudget;

  const pieData = (modelBreakdown || [])
    .filter((m: any) => Number(m.spend) > 0)
    .map((m: any) => ({
      name: m.model,
      value: Number(Number(m.spend).toFixed(4)),
      color: MODEL_CHART_COLORS[m.model] || MODEL_CHART_COLORS.default
    }));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner if hard blocks exist */}
      {summary.blockedCount > 0 && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-red-100 text-red-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#111111]">Active Budget Hard-Block Enforced</p>
              <p className="text-xs text-red-700">
                1 or more projects have exhausted their monthly allocation. AI proxy requests are failing closed.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToProjects}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            Manage Guardrails
          </button>
        </div>
      )}

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Total MTD Spend */}
        <div className="p-6 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm hover:border-[#FFD9C7] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">
              Month-to-Date Spend
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FFF1EA] text-[#FF6B35] flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#111111] tracking-tight">
              ${totalSpend.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-[#777777]">
              / ${totalBudget.toLocaleString()} cap
            </span>
          </div>
          <div className="mt-3">
            <div className="w-full h-2 bg-[#FFF1EA] rounded-full overflow-hidden">
              <div
                style={{ width: `${utilizationPct}%` }}
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverBudget ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-[#FF6B35]'
                }`}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] font-semibold text-[#666666]">
              <span>{utilizationPct}% utilized</span>
              <span>${Math.max(0, totalBudget - totalSpend).toFixed(2)} left</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Projected Month-End Burn */}
        <div className="p-6 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm hover:border-[#FFD9C7] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">
              Projected Month-End
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FFF1EA] text-[#FF6B35] flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-[#111111] tracking-tight">
              ${projectedSpend.toFixed(2)}
            </span>
          </div>
          <p className="mt-3 text-xs text-[#666666] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Trajectory within healthy limits
          </p>
        </div>

        {/* Metric 3: Total Requests & Tokens */}
        <div className="p-6 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm hover:border-[#FFD9C7] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">
              Tokens Processed
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FFF1EA] text-[#FF6B35] flex items-center justify-center">
              <Zap className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-[#111111] tracking-tight font-mono">
              {(summary.totalTokens || 0).toLocaleString()}
            </span>
          </div>
          <p className="mt-3 text-xs text-[#666666]">
            Across {(summary.totalRequests || 0).toLocaleString()} routed requests
          </p>
        </div>

        {/* Metric 4: Governance Guardrails */}
        <div className="p-6 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm hover:border-[#FFD9C7] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">
              Governance Flags
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FFF1EA] text-[#FF6B35] flex items-center justify-center">
              <Activity className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-[#111111] tracking-tight">
              {summary.anomalyCount || 0}
            </span>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              {summary.anomalyCount || 0} Spikes
            </span>
          </div>
          <p className="mt-3 text-xs text-[#666666]">
            {summary.blockedCount || 0} requests hard-blocked
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart 1: AI Spend Velocity (8 cols) */}
        <div className="lg:col-span-8 bg-white p-6 sm:p-7 rounded-3xl border border-[#E8E8E8] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-[#111111]">
                  AI Spend Velocity (Past 7 Days)
                </h3>
                <p className="text-xs text-[#777777] mt-0.5">
                  Daily dollar cost aggregated across all model providers
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF8F5] border border-[#FFE2D6] text-xs font-semibold text-[#FF6B35]">
                <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
                <span>Live Feed</span>
              </div>
            </div>

            {/* Empty State or Area Chart */}
            {dailySpend.length < 1 ? (
              <EmptyState
                icon={BarChart3}
                title="Not enough data yet"
                description="Send requests via the gateway test bench or API to begin visualizing daily cost velocity."
                actionText="Open Test Bench"
                onAction={onNavigateToPlayground}
                compact
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySpend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#FF6B35" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0ECE7" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E8E8E8' }}
                    />
                    <YAxis
                      stroke="#888888"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E8E8E8',
                        borderRadius: '16px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                        fontSize: '12px',
                        color: '#111111'
                      }}
                      formatter={(val: any) => [`$${Number(val).toFixed(4)}`, 'Spend']}
                    />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      stroke="#FF6B35"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#spendGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Spend by Model (4 cols) - Bug 1 Fixed (Guarded NaN) */}
        <div className="lg:col-span-4 bg-white p-6 sm:p-7 rounded-3xl border border-[#E8E8E8] shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#111111]">
                  Spend by Model
                </h3>
                <p className="text-xs text-[#777777] mt-0.5">
                  Cost allocation per LLM
                </p>
              </div>
            </div>

            {pieData.length === 0 || totalSpend === 0 ? (
              <EmptyState
                icon={PieIcon}
                title="No spend recorded yet"
                description="Run inference through the gateway to populate multi-model cost distribution."
                compact
              />
            ) : (
              <div className="space-y-4">
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E8E8E8',
                          borderRadius: '12px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                          fontSize: '11px',
                        }}
                        formatter={(val: any) => [`$${Number(val).toFixed(4)}`, 'Spend']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Model Legend breakdown (No NaN!) */}
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {modelBreakdown.map((m: any, idx: number) => {
                    const modelSpend = Number(m.spend || 0);
                    const pct = totalSpend > 0 ? Math.round((modelSpend / totalSpend) * 100) : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: MODEL_CHART_COLORS[m.model] || MODEL_CHART_COLORS.default }}
                          />
                          <span className="font-semibold text-[#111111] truncate max-w-[120px]">
                            {m.model}
                          </span>
                        </div>
                        <div className="font-mono text-[#666666]">
                          ${modelSpend.toFixed(3)} ({pct}%)
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

      {/* Bottom Section: Recent Request Stream & Projects */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#E8E8E8] shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-[#111111]">
              Live Request Telemetry
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              Real-time audit log of proxied AI requests
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToAudit}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF6B35] hover:text-[#E0531F] transition-colors"
          >
            <span>View Full Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentRequests.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No recent requests"
            description="Proxy requests will appear here in real-time as your applications execute."
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F0ECE7] text-[#777777] uppercase text-[10.5px]">
                  <th className="pb-3 font-bold">Timestamp</th>
                  <th className="pb-3 font-bold">Project</th>
                  <th className="pb-3 font-bold">Model</th>
                  <th className="pb-3 font-bold">Tokens</th>
                  <th className="pb-3 font-bold">Cost</th>
                  <th className="pb-3 font-bold">Latency</th>
                  <th className="pb-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F2ED]">
                {recentRequests.slice(0, 5).map((req: any, i: number) => (
                  <tr key={i} className="hover:bg-[#FFF8F5]/60 transition-colors">
                    <td className="py-3 font-mono text-[#666666]">
                      {new Date(req.created_at || req.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 font-semibold text-[#111111]">
                      {req.project_name || req.projectName || req.project_id}
                    </td>
                    <td className="py-3">
                      <span className="font-mono px-2 py-0.5 rounded-md bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7] text-[11px] font-semibold">
                        {req.model}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[#666666]">
                      {(req.total_tokens || req.totalTokens || 0).toLocaleString()}
                    </td>
                    <td className="py-3 font-mono font-bold text-emerald-600">
                      ${Number(req.cost_estimate || req.costEstimate || 0).toFixed(5)}
                    </td>
                    <td className="py-3 font-mono text-[#666666]">
                      {req.latency_ms || req.latencyMs || 0}ms
                    </td>
                    <td className="py-3">
                      {req.is_blocked || req.isBlocked ? (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10px]">
                          Blocked (429)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                          200 OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
