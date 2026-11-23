'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  DollarSign,
  TrendingUp,
  Activity,
  TriangleAlert,
  Zap,
  Clock,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { modelChartColor } from '@/lib/tokens';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton, ChartSkeleton } from '@/components/ui/LoadingSkeleton';
import { OnboardingChecklist } from './OnboardingChecklist';
import type { PieSlice } from './OverviewCharts';
import type { DashboardAnalytics } from '@/lib/types';

type DateFilter = '24h' | '7d' | '30d' | 'mtd';
const DATE_FILTERS: Array<{ id: DateFilter; label: string }> = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'mtd', label: 'Month-to-Date' },
];

// Lazy load heavy Recharts bundle dynamically
const OverviewCharts = dynamic(
  () => import('./OverviewCharts').then((mod) => mod.OverviewCharts),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8"><ChartSkeleton /></div>
        <div className="lg:col-span-4"><ChartSkeleton /></div>
      </div>
    ),
  }
);

interface OverviewViewProps {
  analyticsData: DashboardAnalytics | null;
  projectsCount?: number;
  hasProviderKeys?: boolean;
  hasGatewayKeys?: boolean;
  onNavigateToProjects: () => void;
  onNavigateToPlayground: () => void;
  onNavigateToAudit: () => void;
  onNavigateToKeys?: () => void;
}

export function OverviewView({
  analyticsData,
  projectsCount = 0,
  hasProviderKeys = false,
  hasGatewayKeys = false,
  onNavigateToProjects,
  onNavigateToPlayground,
  onNavigateToAudit,
  onNavigateToKeys,
}: OverviewViewProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('mtd');

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
    .filter((m) => Number(m.spend) > 0)
    .map((m): PieSlice => ({
      name: m.model,
      value: Number(Number(m.spend).toFixed(4)),
      color: modelChartColor(m.model)
    }));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner if hard blocks exist */}
      {summary.blockedCount > 0 && (
        <div className="p-4 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <TriangleAlert className="w-5 h-5 text-[#DC2626] shrink-0" />
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
            className="px-4 py-1.5 rounded-full bg-[#DC2626] text-white font-semibold text-xs hover:bg-[#B91C1C] transition-colors shrink-0 shadow-xs"
          >
            Review Limits
          </button>
        </div>
      )}

      {/* Persistent FinOps Activation Checklist */}
      <OnboardingChecklist
        projectsCount={projectsCount}
        hasProviderKeys={hasProviderKeys}
        hasGatewayKeys={hasGatewayKeys}
        totalRequests={summary.totalRequests || 0}
        onNavigateToProjects={onNavigateToProjects}
        onNavigateToKeys={onNavigateToKeys || onNavigateToProjects}
        onNavigateToPlayground={onNavigateToPlayground}
      />

      {/* Date Filter & View Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-normal text-[#141413] tracking-tight">
            Financial & Operational Telemetry
          </h2>
          <p className="text-xs text-[#5F6368] mt-0.5">
            Real-time multi-model spend monitoring, capacity reservations, and 3-sigma anomaly flags.
          </p>
        </div>

        {/* Date Filter Pills */}
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#FAF8F5] border border-[#E4E4E0] self-start sm:self-auto shadow-2xs">
          <Calendar className="w-3.5 h-3.5 text-[#888882] ml-2 mr-1" />
          {DATE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                dateFilter === f.id
                  ? 'bg-white text-[#141413] font-bold shadow-2xs'
                  : 'text-[#5F6368] hover:text-[#141413]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary FinOps KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Month-to-Date Spend */}
        <div className="p-5 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-mono uppercase tracking-wider text-label font-medium">MTD AI Spend</span>
              <DollarSign className="w-4 h-4 text-[#FF6B35]" />
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-serif text-3xl font-normal text-[#141413] tabular-nums tracking-tight">
                ${totalSpend.toFixed(2)}
              </span>
              <span className="text-xs text-[#80868B] font-mono tabular-nums">
                / ${totalBudget.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full h-1.5 bg-[#F3F3F0] rounded-full overflow-hidden">
              <div
                style={{ width: `${utilizationPct}%` }}
                className={`h-full transition-all duration-300 ${
                  isOverBudget ? 'bg-[#DC2626]' : isWarning ? 'bg-[#D97706]' : 'bg-[#FF6B35]'
                }`}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-label text-[#5F6368] font-mono tabular-nums">
              <span>{utilizationPct}% utilized</span>
              <span>${Math.max(0, totalBudget - totalSpend).toFixed(2)} remaining</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Projected Month-End Burn */}
        <div className="p-5 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-mono uppercase tracking-wider text-label font-medium">Projected Burn</span>
              <TrendingUp className="w-4 h-4 text-[#5F6368]" />
            </div>
            <div className="mt-3">
              <span className="font-serif text-3xl font-normal text-[#141413] tabular-nums tracking-tight">
                ${projectedSpend.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mt-4 text-label text-[#5F6368] flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${projectedSpend > totalBudget ? 'bg-[#DC2626]' : 'bg-[#0D9488]'}`} />
            <span>{projectedSpend > totalBudget ? 'Projected to exceed budget' : 'Pacing within monthly limit'}</span>
          </div>
        </div>

        {/* Metric 3: Total Requests & Tokens */}
        <div className="p-5 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-mono uppercase tracking-wider text-label font-medium">Tokens Processed</span>
              <Zap className="w-4 h-4 text-[#5F6368]" />
            </div>
            <div className="mt-3">
              <span className="font-serif text-3xl font-normal text-[#141413] tabular-nums tracking-tight">
                {(summary.totalTokens || 0).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-4 text-label text-[#5F6368]">
            Across <span className="font-mono tabular-nums font-semibold text-[#141413]">{(summary.totalRequests || 0).toLocaleString()}</span> requests
          </div>
        </div>

        {/* Metric 4: Governance Guardrails */}
        <div className="p-5 bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F6368]">
              <span className="font-mono uppercase tracking-wider text-label font-medium">Guardrails & Alerts</span>
              <Activity className="w-4 h-4 text-[#5F6368]" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-serif text-3xl font-normal text-[#141413] tabular-nums tracking-tight">
                {summary.anomalyCount || 0}
              </span>
              <span className="text-label font-semibold text-[#D97706] bg-[#FFFBEB] px-2 py-0.5 rounded-full border border-[#FDE68A]">
                Spikes Flagged
              </span>
            </div>
          </div>
          <div className="mt-4 text-label text-[#5F6368]">
            <span className="font-mono tabular-nums font-semibold text-[#141413]">{summary.blockedCount || 0}</span> requests hard-blocked
          </div>
        </div>
      </div>

      {/* Lazy-Loaded Overview Charts */}
      <OverviewCharts
        dailySpend={dailySpend}
        pieData={pieData}
        totalSpend={totalSpend}
        onNavigateToPlayground={onNavigateToPlayground}
      />

      {/* Recent Ledger Activity Table */}
      <div className="bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif text-lg font-normal text-[#141413] tracking-tight">Recent Governance Ledger</h3>
            <p className="text-xs text-[#5F6368] mt-0.5">Real-time inference requests audited across all models</p>
          </div>
          <button
            type="button"
            onClick={onNavigateToAudit}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF6B35] hover:text-[#E55A25] transition-colors"
          >
            <span>View Complete Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentRequests.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No activity recorded yet"
            description="Requests routed through your gateway will appear here with cryptographic timestamps."
            actionText="Test in Playground"
            onAction={onNavigateToPlayground}
          />
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E4E4E0] text-label font-mono text-[#5F6368] uppercase tracking-wider">
                  <th className="py-3 px-3">Request ID</th>
                  <th className="py-3 px-3">Model</th>
                  <th className="py-3 px-3">Tokens</th>
                  <th className="py-3 px-3">Cost</th>
                  <th className="py-3 px-3">Latency</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECECE8]">
                {recentRequests.slice(0, 5).map((req) => (
                  <tr key={req.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3 px-3 font-mono text-[#5F6368]">
                      {req.id.slice(0, 14)}...
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono font-medium text-[#141413] bg-[#FAF8F5] px-2 py-0.5 rounded-full border border-[#E4E4E0]">
                        {req.model}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[#141413]">
                      {(req.total_tokens || req.tokens_in + req.tokens_out || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums font-semibold text-[#141413]">
                      ${Number(req.cost_estimate || 0).toFixed(4)}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-[#5F6368]">
                      {req.latency_ms}ms
                    </td>
                    <td className="py-3 px-3">
                      {req.is_blocked ? (
                        <span className="px-2 py-0.5 rounded-full text-caption font-mono font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                          429 BLOCKED
                        </span>
                      ) : req.is_anomaly ? (
                        <span className="px-2 py-0.5 rounded-full text-caption font-mono font-semibold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A]">
                          FLAGGED SPIKE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-caption font-mono font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
                          200 OK
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-[#80868B] font-mono text-label">
                      {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
