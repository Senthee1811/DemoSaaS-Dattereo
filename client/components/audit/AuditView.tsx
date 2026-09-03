'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Filter, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  Activity, 
  ExternalLink,
  RefreshCw,
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/LoadingSkeleton';

interface AuditLog {
  id: string;
  projectId: string;
  projectName?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  costEstimate: number;
  latencyMs: number;
  statusCode: number;
  isAnomaly: boolean;
  anomalyReason?: string;
  isBlocked: boolean;
  promptPreview?: string;
  responsePreview?: string;
  timestamp: string;
}

interface AuditViewProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId?: string;
}

export function AuditView({ projects, selectedProjectId }: AuditViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState(selectedProjectId || '');
  const [filterModel, setFilterModel] = useState('');
  const [filterAnomalyOnly, setFilterAnomalyOnly] = useState(false);
  const [filterBlockedOnly, setFilterBlockedOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProject) params.append('projectId', filterProject);
      if (filterModel) params.append('model', filterModel);
      if (filterAnomalyOnly) params.append('anomalyOnly', 'true');
      if (filterBlockedOnly) params.append('blockedOnly', 'true');
      
      const res = await fetch(`/api/v1/audit?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterProject, filterModel, filterAnomalyOnly, filterBlockedOnly]);

  useEffect(() => {
    if (selectedProjectId) {
      setFilterProject(selectedProjectId);
    }
  }, [selectedProjectId]);

  const handleExportCsv = () => {
    const url = filterProject ? `/api/v1/audit/export?projectId=${filterProject}` : '/api/v1/audit/export';
    window.open(url, '_blank');
  };

  const filteredLogs = logs.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.id.toLowerCase().includes(q) ||
      l.model.toLowerCase().includes(q) ||
      (l.projectName && l.projectName.toLowerCase().includes(q)) ||
      (l.userName && l.userName.toLowerCase().includes(q))
    );
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
            Immutable Audit Trail & Ledger
          </h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
            Cryptographically sealed per-request governance records for SOC2, compliance, and cost attribution.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-[#E8E8E8] hover:border-[#FFD9C7] text-xs font-bold text-[#111111] hover:text-[#FF6B35] shadow-sm transition-all"
        >
          <Download className="w-4 h-4 text-[#FF6B35]" />
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Filter Controls Bar */}
      <div className="p-4 bg-white rounded-3xl border border-[#E8E8E8] shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]" />
            <input
              type="text"
              placeholder="Search by ID, model, user, or project..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
            />
          </div>

          {/* Project Filter */}
          <select
            value={filterProject}
            onChange={(e) => {
              setFilterProject(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by project"
            className="px-3 py-1.5 rounded-xl border border-[#E8E8E8] text-xs font-semibold text-[#111111] bg-[#FFF8F5] focus:outline-none focus:border-[#FF6B35]"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Model Filter */}
          <select
            value={filterModel}
            onChange={(e) => {
              setFilterModel(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by AI model"
            className="px-3 py-1.5 rounded-xl border border-[#E8E8E8] text-xs font-semibold text-[#111111] bg-[#FFF8F5] focus:outline-none focus:border-[#FF6B35]"
          >
            <option value="">All Models</option>
            <option value="gpt-4o">OpenAI GPT-4o</option>
            <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
            <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
          </select>
        </div>

        {/* Toggle Badges */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFilterAnomalyOnly(!filterAnomalyOnly);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              filterAnomalyOnly
                ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
                : 'bg-white text-[#666666] border-[#E8E8E8] hover:border-[#CCCCCC]'
            }`}
          >
            ⚡ Spikes Only
          </button>

          <button
            type="button"
            onClick={() => {
              setFilterBlockedOnly(!filterBlockedOnly);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              filterBlockedOnly
                ? 'bg-red-100 text-red-800 border-red-300 shadow-sm'
                : 'bg-white text-[#666666] border-[#E8E8E8] hover:border-[#CCCCCC]'
            }`}
          >
            🛑 Blocked Only
          </button>

          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="p-1.5 text-[#666666] hover:text-[#111111] rounded-xl hover:bg-[#FFF8F5]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#FF6B35]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-3xl border border-[#E8E8E8] shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableRowSkeleton count={8} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FileText}
              title="No audit records found"
              description="No inference requests match your current search and filter parameters."
              compact
            />
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FFF8F5] border-b border-[#E8E8E8] text-[#777777] uppercase text-[10.5px]">
                    <th className="py-3 px-5 font-bold">Request ID & Timestamp</th>
                    <th className="py-3 px-4 font-bold">Project & User</th>
                    <th className="py-3 px-4 font-bold">Model & Provider</th>
                    <th className="py-3 px-4 font-bold">Tokens</th>
                    <th className="py-3 px-4 font-bold">Exact Cost</th>
                    <th className="py-3 px-4 font-bold">Latency</th>
                    <th className="py-3 px-4 font-bold">Governance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2EFEA]">
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FFF8F5]/50 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="font-mono font-bold text-[#111111]">{log.id}</div>
                        <div className="text-[11px] text-[#777777]">
                          {new Date(log.timestamp).toLocaleString()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#111111]">{log.projectName || log.projectId}</div>
                        <div className="text-[11px] text-[#777777]">{log.userName || 'API Client'}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono px-2 py-0.5 rounded-md bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7] text-[11px] font-semibold">
                          {log.model}
                        </span>
                        <div className="text-[10px] text-[#777777] mt-0.5 uppercase font-mono">{log.provider}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[#555555]">
                        <div>{(log.totalTokens || (log.tokensIn + log.tokensOut)).toLocaleString()}</div>
                        <div className="text-[10px] text-[#888888]">{log.tokensIn} in / {log.tokensOut} out</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">
                        ${Number(log.costEstimate).toFixed(6)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[#555555]">
                        {log.latencyMs}ms
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {log.isBlocked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10.5px]">
                              <ShieldAlert className="w-3 h-3" />
                              <span>429 Blocked</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10.5px]">
                              <ShieldCheck className="w-3 h-3" />
                              <span>200 Approved</span>
                            </span>
                          )}

                          {log.isAnomaly && (
                            <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              ⚡ {log.anomalyReason || 'Spike Anomaly'}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-[#E8E8E8] bg-[#FFF8F5]/40 flex items-center justify-between text-xs text-[#666666]">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} records
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-[#E8E8E8] bg-white text-[#111111] disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-[#111111]">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-[#E8E8E8] bg-white text-[#111111] disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
