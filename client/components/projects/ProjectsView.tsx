'use client';

import React, { useState } from 'react';
import {
  Plus,
  ShieldAlert,
  ShieldCheck,
  Settings2,
  Lock,
  Unlock,
  AlertTriangle,
  X,
  FolderKanban,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';
import { ConfirmDialog, useToast } from '@/components/ui/feedback';

export interface ProjectItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  budgetMonthly: number;
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
  const toast = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Project Form State
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [budgetMonthly, setBudgetMonthly] = useState('1000');
  const [budgetHardBlockEnabled, setBudgetHardBlockEnabled] = useState(true);

  // Aggregate Metrics
  const totalAllocation = projects.reduce((acc, p) => acc + Number(p.budgetMonthly || 0), 0);
  const totalSpend = projects.reduce((acc, p) => acc + Number(p.currentMonthlySpend || 0), 0);
  const blockedCount = projects.filter((p) => p.isBlocked).length;

  // Emergency freeze (Type C, confirmed first) / lift freeze (direct, toast)
  const [pendingFreeze, setPendingFreeze] = useState<ProjectItem | null>(null);
  const [unfreezingId, setUnfreezingId] = useState<string | null>(null);
  const setBlocked = async (project: ProjectItem, isBlocked: boolean) => {
    const res = await authFetch('/api/v1/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: project.id,
        isBlocked,
        blockReason: isBlocked ? 'Manual Emergency Hard-Block enforced by Administrator' : null,
      }),
    });
    if (!res.ok) throw new Error(await readApiError(res, 'The project could not be updated.'));
    onRefresh();
  };
  const handleToggleBlock = async (project: ProjectItem) => {
    if (!project.isBlocked) {
      setPendingFreeze(project);
      return;
    }
    setUnfreezingId(project.id);
    try {
      await setBlocked(project, false);
      toast.success(`Traffic resumed for ${project.name}`);
    } catch (err) {
      toast.error('Could not lift the freeze', errorMessage(err));
    } finally {
      setUnfreezingId(null);
    }
  };

  // Create Project
  const handleCreateProject = async () => {
    if (!name) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
          description,
          budgetMonthly: Number(budgetMonthly),
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
      const res = await authFetch('/api/v1/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProject.id,
          budgetMonthly: Number(budgetMonthly),
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
          <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">
            Projects & Budget Guardrails
          </h2>
          <p className="text-xs text-fg-secondary mt-1">
            Assign monthly limits, soft-warning thresholds, and fail-closed blocking rules per team.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Aggregate FinOps Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-surface p-5 rounded-card border border-line shadow-2xs">
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Active Projects</span>
          <p className="font-serif text-2xl font-normal text-fg tabular-nums mt-1">{projects.length}</p>
        </div>
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Total Allocation</span>
          <p className="font-serif text-2xl font-normal text-fg tabular-nums mt-1">${totalAllocation.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Current Period Spend</span>
          <p className="font-serif text-2xl font-normal text-success tabular-nums mt-1">${totalSpend.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Emergency Freezes</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${blockedCount > 0 ? 'text-critical' : 'text-fg-secondary'}`}>
            {blockedCount}
          </p>
        </div>
      </div>

      {/* Projects Table */}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects configured"
          description="Create your first project to scope API keys, assign budget limits, and monitor expenditures."
          actionText="Create First Project"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-fg-secondary font-semibold border-b border-line">
                <tr>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Project Name & ID</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">MTD Spend vs Budget</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Utilization</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Enforcement</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-fg">
                {projects.map((proj) => {
                  const currentSpend = Number(proj.currentMonthlySpend || 0);
                  const budget = Number(proj.budgetMonthly || 1000);
                  const utilization = budget > 0 ? Math.min(100, Math.round((currentSpend / budget) * 100)) : 0;
                  const isExceeded = currentSpend >= budget;
                  const isWarning = utilization >= 80 && !isExceeded;

                  return (
                    <tr key={proj.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-xs text-fg">{proj.name}</div>
                        <div className="text-label font-mono text-fg-muted">id: {proj.id}</div>
                        {proj.description && (
                          <div className="text-label text-fg-secondary mt-0.5 line-clamp-1">{proj.description}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {proj.isBlocked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-critical-bg text-critical border border-critical-border">
                            <ShieldAlert className="w-3 h-3" />
                            <span>BLOCKED</span>
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-warning-bg text-warning border border-warning-border">
                            <AlertTriangle className="w-3 h-3" />
                            <span>WARNING (80%)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-success-bg text-success border border-success-border">
                            <ShieldCheck className="w-3 h-3" />
                            <span>HEALTHY</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 min-w-[200px]">
                        <div className="flex items-center justify-between text-label font-mono tabular-nums mb-1.5">
                          <span className="font-semibold text-fg">${currentSpend.toFixed(2)}</span>
                          <span className="text-fg-muted">/ ${budget.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden">
                          <div
                            style={{ width: `${utilization}%` }}
                            className={`h-full transition-all duration-300 ${
                              proj.isBlocked ? 'bg-critical' : isWarning ? 'bg-warning' : 'bg-accent'
                            }`}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-semibold">
                        <span className={isExceeded ? 'text-critical' : isWarning ? 'text-warning' : 'text-fg'}>
                          {utilization}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`text-label font-medium px-2 py-0.5 rounded-full ${
                          proj.budgetHardBlockEnabled
                            ? 'bg-surface-muted text-fg border border-line'
                            : 'bg-transparent text-fg-muted'
                        }`}>
                          {proj.budgetHardBlockEnabled ? 'Fail-Closed (429)' : 'Soft Warning Only'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProject(proj);
                              setBudgetMonthly(String(proj.budgetMonthly));
                              setBudgetHardBlockEnabled(proj.budgetHardBlockEnabled);
                            }}
                            className="p-1.5 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full transition-colors"
                            title="Edit budget allocation"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleBlock(proj)}
                            disabled={unfreezingId === proj.id}
                            aria-label={proj.isBlocked ? `Lift the freeze on ${proj.name}` : `Freeze all traffic for ${proj.name}`}
                            className={`p-1.5 rounded-full transition-colors ${
                              proj.isBlocked
                                ? 'text-success hover:bg-success-bg'
                                : 'text-fg-muted hover:text-critical hover:bg-critical-bg'
                            }`}
                            title={proj.isBlocked ? 'Lift hard-block' : 'Emergency freeze project traffic'}
                          >
                            {proj.isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create Project */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-serif text-lg font-normal text-fg">Create FinOps Project</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-fg block mb-1.5">Project Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Production Copilot"
                  value={name}
                  maxLength={120}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="font-semibold text-fg block mb-1.5">Slug Identifier</label>
                <input
                  type="text"
                  placeholder="production-copilot"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-field border border-line font-mono text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="font-semibold text-fg block mb-1.5">Monthly Budget Limit (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-fg-muted font-mono">$</span>
                  <input
                    type="number"
                    min="0.0001"
                    max="99999999"
                    step="any"
                    value={budgetMonthly}
                    onChange={(e) => setBudgetMonthly(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-field border border-line font-mono text-xs text-fg focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={budgetHardBlockEnabled}
                    onChange={(e) => setBudgetHardBlockEnabled(e.target.checked)}
                    className="rounded-control text-accent mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-fg block">Enforce Atomic Hard-Block (Fail-Closed)</span>
                    <span className="text-fg-secondary text-label block mt-0.5">
                      Rejects proxy requests with HTTP 429 once allocation is exhausted.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-line flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-fg-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={isSubmitting || !name}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Budget */}
      {editingProject && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-serif text-lg font-normal text-fg">Edit Budget — {editingProject.name}</h3>
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-fg block mb-1.5">Monthly Allocation (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-fg-muted font-mono">$</span>
                  <input
                    type="number"
                    min="0.0001"
                    max="99999999"
                    step="any"
                    value={budgetMonthly}
                    onChange={(e) => setBudgetMonthly(e.target.value)}
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-field border border-line font-mono text-xs text-fg focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={budgetHardBlockEnabled}
                    onChange={(e) => setBudgetHardBlockEnabled(e.target.checked)}
                    className="rounded-control text-accent mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-fg block">Fail-Closed Hard Limit</span>
                    <span className="text-fg-secondary text-label block mt-0.5">
                      Enforces sub-5ms Redis reservation checks to block overspend immediately.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-line flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditingProject(null)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-fg-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdateProject}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Saving...' : 'Save Allocation'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingFreeze !== null}
        tone="sensitive"
        title={`Freeze all traffic for "${pendingFreeze?.name}"?`}
        description="Every gateway request for this project is rejected until you lift the freeze."
        consequences={[
          'Apps using this project\'s gateway keys get an error on every request, starting now.',
          'Budgets, keys and history are not changed.',
        ]}
        reversible="Reversible: lift the freeze from this table at any time."
        confirmLabel="Freeze traffic"
        onConfirm={async () => {
          if (!pendingFreeze) return;
          await setBlocked(pendingFreeze, true);
          toast.success(`${pendingFreeze.name} is frozen`, 'All gateway requests for it are being rejected.');
        }}
        onClose={() => setPendingFreeze(null)}
      />
    </div>
  );
}
