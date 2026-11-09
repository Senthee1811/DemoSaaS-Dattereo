'use client';

import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Activity, 
  ShieldAlert, 
  Zap, 
  Clock, 
  CheckCircle2, 
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
import { MODEL_CHART_COLORS } from '@/lib/tokens';
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
      <div className="space-y-5 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8"><ChartSkeleton /></div>
          <div className="lg:col-span-4"><ChartSkeleton /></div>
        </div>
      </div>
    );
  }

  const { summary, dailySpend = [], modelBreakdown = [], recentRequests = [] } = analyticsData;

  const totalSpend = Number(summary.totalSpend || 0);
  const totalBudget = Number(summary.totalBudget || 5000);
  const utilizationPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpend / totalBudget) * 100)) : 0;
  
  // Calculate burn rate based on days elapsed in current month
  const now = new Date();
  const dayOfMonth = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedSpend = (totalSpend / dayOfMonth) * daysInMonth;

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
    <div className="space-y-5 pb-10">
      {/* Top Banner if hard blocks exist */}
      {summary.blockedCount > 0 && (
        <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0" />
            <div>
              <p className="text-xs font-bold text-[#991B1B]">Active Budget Hard-Block Enforced</p>
              <p className="text-xs text-[#B91C1C]">
                One or more projects exceeded their monthly limit. AI proxy requests are failing closed (HTTP 429).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToProjects}
            className="px-3 py-1.5 rounded-md bg-[#DC2626] text-white font-semibold text-xs hover:bg-[#B91C1C] transition-colors"
          >
            Review Limits
          </button>
        </div>
      )}

      {/* Primary FinOps KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Month-to-Date Spend */}
        <div className="p-4 bg-white rounded-xl border border-[#E4E4E0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-semibold uppercase tracking-wider text-[11px]">MTD AI Spend</span>
              <DollarSign className="w-4 h-4 text-[#FF6B35]" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-[#18191B] font-mono tabular-nums tracking-tight">
                ${totalSpend.toFixed(2)}
              </span>
              <span className="text-xs text-[#80868B] font-mono tabular-nums">
                / ${totalBudget.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full h-1.5 bg-[#F3F3F0] rounded-full overflow-hidden">
              <div
                style={{ width: `${utilizationPct}%` }}
                className={`h-full transition-all duration-300 ${
                  isOverBudget ? 'bg-[#DC2626]' : isWarning ? 'bg-[#D97706]' : 'bg-[#FF6B35]'
                }`}
              />
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-[#5F6368] font-mono tabular-nums">
              <span>{utilizationPct}% utilized</span>
              <span>${Math.max(0, totalBudget - totalSpend).toFixed(2)} remaining</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Projected Month-End Burn */}
        <div className="p-4 bg-white rounded-xl border border-[#E4E4E0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Projected Burn</span>
              <TrendingUp className="w-4 h-4 text-[#5F6368]" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-[#18191B] font-mono tabular-nums tracking-tight">
                ${projectedSpend.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-[#5F6368] flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${projectedSpend > totalBudget ? 'bg-[#DC2626]' : 'bg-[#0D9488]'}`} />
            <span>{projectedSpend > totalBudget ? 'Projected to exceed budget' : 'Pacing within monthly limit'}</span>
          </div>
        </div>

        {/* Metric 3: Total Requests & Tokens */}
        <div className="p-4 bg-white rounded-xl border border-[#E4E4E0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Tokens Processed</span>
              <Zap className="w-4 h-4 text-[#5F6368]" />
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-[#18191B] font-mono tabular-nums tracking-tight">
                {(summary.totalTokens || 0).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-[#5F6368]">
            Across <span className="font-mono tabular-nums font-semibold text-[#18191B]">{(summary.totalRequests || 0).toLocaleString()}</span> requests
          </div>
        </div>

        {/* Metric 4: Governance Guardrails */}
        <div className="p-4 bg-white rounded-xl border border-[#E4E4E0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Guardrails & Alerts</span>
              <Activity className="w-4 h-4 text-[#5F6368]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#18191B] font-mono tabular-nums tracking-tight">
                {summary.anomalyCount || 0}
              </span>
              <span className="text-[11px] font-semibold text-[#D97706] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                Spikes Flagged
              </span>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-[#5F6368]">
            <span className="font-mono tabular-nums font-semibold text-[#18191B]">{summary.blockedCount || 0}</span> requests hard-blocked
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Spend Velocity Chart (8 cols) */}
        <div className="lg:col-span-8 bg-white p-5 rounded-xl border border-[#E4E4E0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#18191B]">
                  Spend Velocity (Past 7 Days)
                </h3>
                <p className="text-xs text-[#5F6368]">
                  Aggregated USD cost across OpenAI, Anthropic, and Gemini
                </p>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-semibold text-[#0D9488] bg-[#F0FDF4] border border-[#BBF7D0] rounded">
                Live Telemetry
              </span>
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
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySpend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E4E4E0' }}
                    />
                    <YAxis
                      stroke="#80868B"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E4E4E0',
                        borderRadius: '8px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                        fontSize: '11px',
                        color: '#18191B'
                      }}
                      formatter={(val: any) => [`$${Number(val).toFixed(4)}`, 'Cost']}
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
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-[#E4E4E0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#18191B]">Cost by Model</h3>
                <p className="text-xs text-[#5F6368]">Relative expenditure</p>
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
              <div className="space-y-3">
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={46}
                        outerRadius={68}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E4E4E0',
                          borderRadius: '8px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                          fontSize: '11px',
                        }}
                        formatter={(val: any) => [`$${Number(val).toFixed(4)}`, 'Cost']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Model Legend */}
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {modelBreakdown.map((m: any, idx: number) => {
                    const modelSpend = Number(m.spend || 0);
                    const pct = totalSpend > 0 ? Math.round((modelSpend / totalSpend) * 100) : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: MODEL_CHART_COLORS[m.model] || MODEL_CHART_COLORS.default }}
                          />
                          <span className="font-mono text-xs text-[#18191B] truncate max-w-[130px]">
                            {m.model}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-xs text-[#5F6368]">
                          ${modelSpend.toFixed(3)} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Request Telemetry Table */}
      <div className="bg-white rounded-xl border border-[#E4E4E0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E4E4E0] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#18191B]">Live Inference Telemetry</h3>
            <p className="text-xs text-[#5F6368]">Recent gateway transactions with exact cost attribution</p>
          </div>
          <button
            type="button"
            onClick={onNavigateToAudit}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF6B35] hover:text-[#E85520] transition-colors"
          >
            <span>Audit Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentRequests.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Layers}
              title="No recent requests"
              description="Requests sent through the proxy endpoint appear here in real time."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F3F3F0] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-2.5 px-3.5">Timestamp</th>
                  <th className="py-2.5 px-3.5">Project</th>
                  <th className="py-2.5 px-3.5">Model</th>
                  <th className="py-2.5 px-3.5 text-right">Tokens</th>
                  <th className="py-2.5 px-3.5 text-right">Cost (USD)</th>
                  <th className="py-2.5 px-3.5 text-right">Latency</th>
                  <th className="py-2.5 px-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#18191B]">
                {recentRequests.slice(0, 6).map((req: any, i: number) => (
                  <tr key={i} className="hover:bg-[#FBFBFA] transition-colors">
                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#5F6368]">
                      {new Date(req.created_at || req.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3.5 font-medium">
                      {req.project_name || req.projectName || req.project_id}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F3F3F0] text-[#18191B] border border-[#E4E4E0]">
                        {req.model}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right text-[#5F6368]">
                      {(req.total_tokens || req.totalTokens || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right font-semibold text-[#0D9488]">
                      ${Number(req.cost_estimate || req.costEstimate || 0).toFixed(5)}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-right text-[#5F6368]">
                      {req.latency_ms || req.latencyMs || 0}ms
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {req.is_blocked || req.isBlocked ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                          Blocked (429)
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
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
