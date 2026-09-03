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
  Check
} from 'lucide-react';

interface ProjectItem {
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

  // New Project Form State
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
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
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

  // Update Budget
  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProject.id,
          budgetMonthly: editingProject.budgetMonthly,
          budgetWeekly: editingProject.budgetMonthly / 4,
          budgetHardBlockEnabled: editingProject.budgetHardBlockEnabled,
          // If spend is below new budget and was auto-blocked, unblock
          isBlocked: editingProject.currentMonthlySpend >= editingProject.budgetMonthly ? 1 : 0
        })
      });
      if (res.ok) {
        setEditingProject(null);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update project budget:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Projects & Budget Guardrails</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure hard caps, weekly allowances, and automated fail-closed policies per project.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-cyan-500/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projects.map((p) => {
          const isOver = p.currentMonthlySpend >= p.budgetMonthly;
          const isNear = p.utilizationPct >= 80 && !isOver;

          return (
            <div
              key={p.id}
              className={`glass-card p-5 rounded-xl border flex flex-col justify-between transition-all ${
                p.isBlocked
                  ? 'border-rose-800/80 bg-rose-950/15'
                  : isNear
                  ? 'border-amber-700/60 bg-amber-950/10'
                  : 'border-slate-800/80'
              }`}
            >
              <div>
                {/* Project Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-base text-white">{p.name}</h3>
                      {p.isBlocked ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          HARD BLOCKED
                        </span>
                      ) : isNear ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          WARNING 80%+
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                      {p.description || 'No description provided.'}
                    </p>
                  </div>

                  <button
                    onClick={() => setEditingProject(p)}
                    className="p-1.5 rounded-lg bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700/60 border border-slate-700/60 transition-all"
                    title="Edit Budget Guardrail"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Reason Banner if Blocked */}
                {p.isBlocked && (
                  <div className="p-2.5 rounded-lg bg-rose-900/30 border border-rose-800/50 text-xs text-rose-300 flex items-start space-x-2 mb-3">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <span>{p.blockReason || 'Requests are currently blocked by policy.'}</span>
                  </div>
                )}

                {/* Spend Metric & Progress */}
                <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/60 space-y-2 mb-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[11px] text-slate-400 font-medium">Monthly Spend</span>
                      <div className="flex items-baseline space-x-1.5 mt-0.5">
                        <span className="text-xl font-extrabold text-white">
                          ${p.currentMonthlySpend.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400">/ ${p.budgetMonthly.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-200">{p.utilizationPct}%</span>
                      <p className="text-[10px] text-slate-400">{p.requestCount} requests</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        p.isBlocked
                          ? 'bg-rose-500'
                          : isNear
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(100, p.utilizationPct)}%` }}
                    />
                  </div>
                </div>

                {/* Guardrail Policy Features */}
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-4">
                  <div className="p-2 rounded bg-slate-900/40 border border-slate-800/40">
                    <span className="text-[10px] text-slate-500 block">Weekly Soft Cap</span>
                    <span className="font-semibold text-slate-200">${p.budgetWeekly.toFixed(2)}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-900/40 border border-slate-800/40">
                    <span className="text-[10px] text-slate-500 block">Fail-Closed Cap</span>
                    <span className="font-semibold text-cyan-400">
                      {p.budgetHardBlockEnabled ? 'Enabled (Strict)' : 'Soft Alert Only'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <button
                  onClick={() => handleToggleBlock(p)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    p.isBlocked
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60'
                  }`}
                >
                  {p.isBlocked ? (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Unfreeze AI Access</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Emergency Freeze</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setEditingProject(p)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                >
                  Adjust Budget Limit →
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-slate-700/80 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Create Governed Project</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mobile AI Assistant"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Project Slug / Identifier</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="mobile-ai-assistant"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Purpose of this AI project and team ownership..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Monthly Budget Cap (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    required
                    value={budgetMonthly}
                    onChange={(e) => setBudgetMonthly(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="hardBlockCheck"
                  checked={budgetHardBlockEnabled}
                  onChange={(e) => setBudgetHardBlockEnabled(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="hardBlockCheck" className="text-xs text-slate-300 cursor-pointer">
                  Enable automatic fail-closed hard-block at 100% budget exhaustion
                </label>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Budget Modal */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-slate-700/80 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Adjust Budget: {editingProject.name}</h3>
              <button
                onClick={() => setEditingProject(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Monthly Budget Cap (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    required
                    value={editingProject.budgetMonthly}
                    onChange={(e) =>
                      setEditingProject({
                        ...editingProject,
                        budgetMonthly: Number(e.target.value)
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Current Month Spend: ${editingProject.currentMonthlySpend.toFixed(2)}
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="editHardBlockCheck"
                  checked={editingProject.budgetHardBlockEnabled}
                  onChange={(e) =>
                    setEditingProject({
                      ...editingProject,
                      budgetHardBlockEnabled: e.target.checked
                    })
                  }
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="editHardBlockCheck" className="text-xs text-slate-300 cursor-pointer">
                  Fail-closed hard block at 100% budget limit
                </label>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
                >
                  {isSubmitting ? 'Saving...' : 'Save Guardrail'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
