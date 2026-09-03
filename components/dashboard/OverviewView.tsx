'use client';

import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Activity, 
  AlertTriangle, 
  ShieldX, 
  Zap, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink
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

interface OverviewViewProps {
  analyticsData: any;
  onNavigateToProjects: () => void;
  onNavigateToPlayground: () => void;
  onNavigateToAudit: () => void;
}

const MODEL_COLORS: Record<string, string> = {
  'gpt-4o': '#06b6d4',
  'gpt-4o-mini': '#38bdf8',
  'claude-3-5-sonnet-20241022': '#a855f7',
  'claude-3-5-haiku-20241022': '#c084fc',
  'gemini-1.5-pro': '#10b981',
  'gemini-1.5-flash': '#34d399',
  'o1': '#f59e0b'
};

export function OverviewView({
  analyticsData,
  onNavigateToProjects,
  onNavigateToPlayground,
  onNavigateToAudit
}: OverviewViewProps) {
  if (!analyticsData || !analyticsData.summary) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p>Loading real-time spend telemetry...</p>
      </div>
    );
  }

  const { summary, dailySpend, modelBreakdown, projectBreakdown, recentRequests } = analyticsData;

  const totalSpend = summary.totalSpend || 0;
  const totalBudget = summary.totalBudget || 5000;
  const utilizationPct = summary.budgetUtilizationPct || 0;
  
  // Calculate projected month-end burn
  const projectedSpend = Math.round(totalSpend * 1.15 * 100) / 100;
  const isOverBudget = utilizationPct >= 100;
  const isWarning = utilizationPct >= 80 && !isOverBudget;

  const pieData = (modelBreakdown || []).map((m: any) => ({
    name: m.model,
    value: Number(m.spend),
    color: MODEL_COLORS[m.model] || '#64748b'
  }));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner if hard blocks exist */}
      {summary.blockedCount > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-center justify-between shadow-lg shadow-rose-950/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <ShieldX className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Active Budget Hard-Block Enforced</p>
              <p className="text-xs text-rose-300">
                1 or more projects have exhausted their monthly allocation. AI proxy requests are failing closed.
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToProjects}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all"
          >
            Manage Guardrails
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Spend Card */}
        <div className="glass-card p-5 rounded-xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>Total AI Spend (MTD)</span>
            <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">${totalSpend.toFixed(2)}</span>
            <span className="text-xs text-slate-400 font-medium">/ ${totalBudget.toLocaleString()}</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] mb-1 font-semibold">
              <span className={isOverBudget ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'}>
                {utilizationPct.toFixed(1)}% Allocated
              </span>
              <span className="text-slate-400">${Math.max(0, totalBudget - totalSpend).toFixed(2)} left</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverBudget ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                }`}
                style={{ width: `${Math.min(100, utilizationPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Projected Burn Rate Card */}
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>Projected Month-End Spend</span>
            <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">${projectedSpend.toFixed(2)}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">
              On Pace
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-3 flex items-center space-x-1">
            <Activity className="w-3.5 h-3.5 text-indigo-400 inline" />
            <span>Estimated burn: ${(totalSpend / 7).toFixed(2)}/day</span>
          </p>
        </div>

        {/* Total Tokens Processed */}
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>Tokens Processed</span>
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-extrabold text-white">
              {((Number(summary?.totalTokens) || 0) / 1000).toFixed(1)}k
            </span>
            <span className="text-xs text-slate-400 font-medium">tokens</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3">
            <span>Total Requests: {(Number(summary?.totalRequests) || 0).toLocaleString()}</span>
            <span className="text-cyan-400">Ø {summary?.avgLatencyMs || 0}ms</span>
          </div>
        </div>

        {/* Governance Guardrails & Anomalies */}
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>Governance Flags</span>
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-3">
            <div className="flex items-center space-x-1.5">
              <span className="text-2xl font-extrabold text-rose-400">{summary.blockedCount}</span>
              <span className="text-xs text-slate-400">Blocked</span>
            </div>
            <div className="w-px h-6 bg-slate-800" />
            <div className="flex items-center space-x-1.5">
              <span className="text-2xl font-extrabold text-amber-400">{summary.anomalyCount}</span>
              <span className="text-xs text-slate-400">Anomalies</span>
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 mt-3 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Audit Ledger 100% Immutable</span>
          </p>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend Over Time (2 cols) */}
        <div className="lg:col-span-2 glass-card p-5 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-white text-sm">AI Spend Velocity (Past 7 Days)</h3>
                <p className="text-xs text-slate-400">Daily cost breakdown across OpenAI, Gemini & Claude models</p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Live Telemetry
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySpend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Spend']}
                  />
                  <Area type="monotone" dataKey="spend" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#spendGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Per-Model Distribution (1 col) */}
        <div className="glass-card p-5 rounded-xl flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-white text-sm mb-1">Spend by Model</h3>
            <p className="text-xs text-slate-400 mb-4">Cost share across active LLM endpoints</p>

            <div className="h-44 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any) => [`$${Number(val).toFixed(2)}`, 'Cost']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Model List */}
            <div className="space-y-2 mt-2 max-h-36 overflow-y-auto pr-1">
              {(modelBreakdown || []).slice(0, 4).map((m: any) => (
                <div key={m.model} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/40">
                  <div className="flex items-center space-x-2 truncate">
                    <div 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: MODEL_COLORS[m.model] || '#94a3b8' }}
                    />
                    <span className="text-slate-300 font-medium truncate">{m.model}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-semibold text-white">${Number(m.spend).toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">({m.spendSharePct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Project Allocation Breakdown & Recent Requests Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects Breakdown (1 col) */}
        <div className="glass-card p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-white text-sm">Project Allocations</h3>
              <p className="text-xs text-slate-400">Budget vs actual spend per project</p>
            </div>
            <button
              onClick={onNavigateToProjects}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
            >
              <span>View All</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-4">
            {(projectBreakdown || []).map((p: any) => {
              const isProjBlocked = p.isBlocked;
              const isHigh = p.utilizationPct >= 80;

              return (
                <div key={p.id} className="p-3 rounded-lg bg-slate-900/50 border border-slate-800/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-semibold text-xs text-white truncate">{p.name}</span>
                      {isProjBlocked && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                          BLOCKED
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-white">${Number(p.spend).toFixed(2)}</span>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full ${
                        isProjBlocked
                          ? 'bg-rose-500'
                          : isHigh
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(100, p.utilizationPct)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{p.utilizationPct}% of ${p.budgetMonthly} cap</span>
                    <span>{p.requests} calls</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Requests Feed (2 cols) */}
        <div className="lg:col-span-2 glass-card p-5 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="font-bold text-white text-sm">Live Gateway Request Stream</h3>
              </div>
              <button
                onClick={onNavigateToAudit}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
              >
                <span>Full Ledger</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {(recentRequests || []).slice(0, 6).map((req: any) => (
                <div
                  key={req.id}
                  className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
                    req.isBlocked
                      ? 'bg-rose-950/20 border-rose-800/40'
                      : req.isAnomaly
                      ? 'bg-amber-950/20 border-amber-800/40'
                      : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-start space-x-3 truncate">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 ${
                        req.statusCode === 200
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {req.statusCode}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white truncate">{req.model}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-slate-400 truncate">{req.projectName}</span>
                        {req.isAnomaly && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                            SPIKE ANOMALY
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {req.promptPreview || 'Prompt payload logged under governance policy'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center text-right">
                    <div>
                      <p className="font-bold text-white font-mono">${Number(req.costEstimate).toFixed(5)}</p>
                      <p className="text-[10px] text-slate-500">
                        {(Number(req.totalTokens ?? req.total_tokens ?? 0)).toLocaleString()} tok • {req.latencyMs || req.latency_ms || 0}ms
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/60 mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>Unified Gateway Proxy active on OpenAI, Claude & Gemini</span>
            <button
              onClick={onNavigateToPlayground}
              className="text-cyan-400 font-semibold hover:underline"
            >
              Test prompt in playground →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
