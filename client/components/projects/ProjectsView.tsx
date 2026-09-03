'use client';

import React, { useState } from 'react';
import { 
  Layers, 
  Plus, 
  ShieldAlert, 
  ShieldCheck, 
  Settings2, 
  Lock, 
  Unlock, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  X,
  Check,
  Zap,
  Activity,
  ArrowRight
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export interface ProjectItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  budgetMonthly: number;
  budgetWeekly: number;
  budgetHardBlockEnabled: boolean;
  isBlocked: boolean;
  blockReason?: string;
  currentMonthlySpend: number;
  currentWeeklySpend: number;
  utilizationPct: number;
  requestCount: number;
}

interface ProjectsViewProps {
  projects: ProjectItem[];
  onRefresh: () => void;
}

export function ProjectsView({ projects, onRefresh }: ProjectsViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Project State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [budgetMonthly, setBudgetMonthly] = useState('800');
  const [budgetHardBlockEnabled, setBudgetHardBlockEnabled] = useState(true);

  // Toggle Hard Block / Emergency Freeze
  const handleToggleBlock = async (project: ProjectItem) => {
    try {
      const newBlockedState = !project.isBlocked;
      const res = await fetch('/api/v1/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          isBlocked: newBlockedState,
          blockReason: newBlockedState ? 'Manual Emergency Hard-Block enforced by Administrator' : null
        })
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to toggle hard-block:', err);
    }
  };

  // Create Project
  const handleCreateProject = async () => {
    if (!name) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
          description,
          budgetMonthly: Number(budgetMonthly),
          budgetWeekly: Number(budgetMonthly) / 4,
          budgetHardBlockEnabled
        })
      });
      if (res.ok) {
        setShowCreateModal(false);
        setName('');
        setSlug('');
        setDescription('');
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Existing Project Budget
  const handleUpdateProject = async () => {
    if (!editingProject) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProject.id,
          budgetMonthly: Number(budgetMonthly),
          budgetWeekly: Number(budgetMonthly) / 4,
          budgetHardBlockEnabled
        })
      });
      if (res.ok) {
        setEditingProject(null);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
            Projects & Budget Guardrails
          </h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
            Configure monthly spend limits, soft warning triggers, and fail-closed blocking per squad.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm shadow-[#FF6B35]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No projects configured"
          description="Create your first project to start scoping AI API keys and enforcing team budgets."
          actionText="Create First Project"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          {projects.map((proj) => {
            const currentSpend = Number(proj.currentMonthlySpend || 0);
            const budget = Number(proj.budgetMonthly || 1000);
            const utilization = budget > 0 ? Math.min(100, Math.round((currentSpend / budget) * 100)) : 0;
            const isExceeded = currentSpend >= budget;
            const isWarning = utilization >= 80 && !isExceeded;

            return (
              <div
                key={proj.id}
                className={`bg-white rounded-3xl border p-6 sm:p-7 transition-all flex flex-col justify-between shadow-sm hover:shadow-md ${
                  proj.isBlocked
                    ? 'border-red-300 ring-1 ring-red-400 bg-red-50/20'
                    : isWarning
                    ? 'border-amber-300'
                    : 'border-[#E8E8E8] hover:border-[#FFD4C2]'
                }`}
              >
                <div>
                  {/* Top Row: Name + Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-[#111111]">
                          {proj.name}
                        </h3>
                        {proj.isBlocked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10.5px]">
                            <ShieldAlert className="w-3 h-3" />
                            <span>HARD-BLOCKED</span>
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10.5px]">
                            <AlertTriangle className="w-3 h-3" />
                            <span>80% WARNING</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10.5px]">
                            <ShieldCheck className="w-3 h-3" />
                            <span>ACTIVE</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#777777] mt-1 font-mono">
                        ID: {proj.id}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingProject(proj);
                        setBudgetMonthly(String(proj.budgetMonthly));
                        setBudgetHardBlockEnabled(proj.budgetHardBlockEnabled);
                      }}
                      className="p-2 text-[#777777] hover:text-[#111111] hover:bg-[#FFF8F5] rounded-xl border border-transparent hover:border-[#E8E8E8] transition-all"
                      title="Edit Budget Limits"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Description */}
                  {proj.description && (
                    <p className="text-xs text-[#666666] mt-2.5 leading-relaxed">
                      {proj.description}
                    </p>
                  )}

                  {/* Budget Usage Meter */}
                  <div className="mt-5 p-4 rounded-2xl bg-[#FFF8F5]/60 border border-[#F0ECE7]">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-bold text-[#111111]">
                        ${currentSpend.toFixed(2)}{' '}
                        <span className="text-[#777777] font-normal">
                          / ${budget.toLocaleString()} monthly
                        </span>
                      </span>
                      <span className={`font-bold ${isExceeded ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-[#FF6B35]'}`}>
                        {utilization}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-[#EAE5DF] rounded-full overflow-hidden">
                      <div
                        style={{ width: `${utilization}%` }}
                        className={`h-full rounded-full transition-all duration-300 ${
                          proj.isBlocked || isExceeded
                            ? 'bg-red-500'
                            : isWarning
                            ? 'bg-amber-500'
                            : 'bg-gradient-to-r from-[#FF8A4C] to-[#FF6B35]'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[11px] text-[#666666]">
                      <span>Weekly Run-rate: ${(currentSpend / 4).toFixed(2)}</span>
                      <span>Remaining: ${Math.max(0, budget - currentSpend).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Block Reason banner if blocked */}
                  {proj.isBlocked && proj.blockReason && (
                    <div className="mt-3 p-3 rounded-xl bg-red-100/70 border border-red-200 text-xs text-red-800 font-medium flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span className="truncate">{proj.blockReason}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-6 pt-4 border-t border-[#F0ECE7] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[#666666]">
                    <Activity className="w-3.5 h-3.5 text-[#FF6B35]" />
                    <span>{proj.requestCount || 0} routed requests</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleBlock(proj)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      proj.isBlocked
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                        : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                    }`}
                  >
                    {proj.isBlocked ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Unblock Project</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Emergency Freeze</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Project */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E8E8E8] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E8]">
              <h3 className="text-lg font-bold text-[#111111]">
                Create New Project
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-[#888888] hover:text-[#111111] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Payments Gateway Copilot"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Project Slug / Identifier
                </label>
                <input
                  type="text"
                  placeholder="e.g. proj_payments_copilot"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Monthly Budget Cap ($ USD) *
                </label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={budgetMonthly}
                  onChange={(e) => setBudgetMonthly(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35]"
                />
              </div>

              <div className="p-3 bg-[#FFF8F5] rounded-xl border border-[#FFE2D6] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#111111]">Fail-Closed Hard Block</div>
                  <div className="text-[11px] text-[#666666]">Automatically reject inference upon 100% budget</div>
                </div>
                <input
                  type="checkbox"
                  checked={budgetHardBlockEnabled}
                  onChange={(e) => setBudgetHardBlockEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#FF6B35] cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8E8E8] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666666] hover:bg-[#F5F5F5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={isSubmitting || !name}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm shadow-[#FF6B35]/30 hover:scale-[1.02] disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Project Budget */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E8E8E8] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E8]">
              <h3 className="text-lg font-bold text-[#111111]">
                Configure Budget Guardrails
              </h3>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="p-1 text-[#888888] hover:text-[#111111] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="text-xs text-[#666666]">
                Editing guardrails for <strong className="text-[#111111]">{editingProject.name}</strong> ({editingProject.id})
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Monthly Spend Limit ($ USD)
                </label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={budgetMonthly}
                  onChange={(e) => setBudgetMonthly(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div className="p-3 bg-[#FFF8F5] rounded-xl border border-[#FFE2D6] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#111111]">Enforce Hard-Block</div>
                  <div className="text-[11px] text-[#666666]">Fail-closed pre-flight rejection (429)</div>
                </div>
                <input
                  type="checkbox"
                  checked={budgetHardBlockEnabled}
                  onChange={(e) => setBudgetHardBlockEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#FF6B35] cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8E8E8] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666666] hover:bg-[#F5F5F5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateProject}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm shadow-[#FF6B35]/30 hover:scale-[1.02]"
              >
                {isSubmitting ? 'Saving...' : 'Update Guardrails'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
