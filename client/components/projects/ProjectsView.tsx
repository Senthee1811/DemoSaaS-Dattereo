'use client';

import { getUsageColor } from '@/lib/usage-color';
import React, { useState } from 'react';
import {
  Plus,
  ShieldAlert,
  Settings2,
  Lock,
  Unlock,
  X,
  FolderKanban,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useEscapeToClose, ConfirmDialog, useToast } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { NumberInput } from '@/components/ui/NumberInput';
import { BUDGET_USD, isNumberInRange } from '@/lib/limits';
import { useScope } from '@/lib/scope';
import { Tip } from '@/components/ui/tooltip';

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

export function ProjectsView({ projects: allProjects, onRefresh }: ProjectsViewProps) {
  // Global scope: show the scoped project only (All projects = every project)
  const { scopeId } = useScope();
  const projects = scopeId ? allProjects.filter((p) => p.id === scopeId) : allProjects;
  const toast = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  useEscapeToClose(showCreateModal, () => setShowCreateModal(false));
  useEscapeToClose(editingProject !== null, () => setEditingProject(null));
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

  // Freeze and unfreeze both go through the shared confirmation dialog, which states the consequence
  // first and keeps the real server error visible if the request fails.
  const [pendingToggle, setPendingToggle] = useState<{ project: ProjectItem; freeze: boolean } | null>(null);
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
  const handleToggleBlock = (project: ProjectItem) => setPendingToggle({ project, freeze: !project.isBlocked });

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
                  const rawPercent = budget > 0 ? (currentSpend / budget) * 100 : 0;
                  const utilization = Math.min(100, Math.round(rawPercent));
                  const usage = getUsageColor(rawPercent, { blocked: proj.isBlocked });

                  return (
                    <tr key={proj.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="py-3.5 px-4">
                        {/* Names wrap (they matter); the UUID truncates but copies whole (select-all) */}
                        <div className="font-semibold text-xs text-fg wrap-break-word max-w-xs">{proj.name}</div>
                        <div className="text-label font-mono text-fg-muted max-w-56 truncate select-all" title={proj.id}>
                          id: {proj.id}
                        </div>
                        {proj.description && (
                          <div className="text-label text-fg-secondary mt-0.5 line-clamp-1 max-w-xs" title={proj.description}>{proj.description}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {proj.isBlocked ? (
                          proj.blockReason?.startsWith('Budget Cap Exceeded') ? (
                            <Badge tone="critical" icon={ShieldAlert} title={proj.blockReason}>Budget cap reached</Badge>
                          ) : (
                            <Badge tone="critical" icon={Lock} title={proj.blockReason || 'Frozen by an administrator'}>Frozen</Badge>
                          )
                        ) : (
                          <Badge tone={usage.tone} icon={usage.icon}>{usage.label}</Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 min-w-50">
                        <div className="flex items-center justify-between text-label font-mono tabular-nums mb-1.5">
                          <span className="font-semibold text-fg">${currentSpend.toFixed(2)}</span>
                          <span className="text-fg-muted">/ ${budget.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden">
                          <div
                            style={{ width: `${utilization}%` }}
                            className={`h-full transition-all duration-300 ${usage.bar}`}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs font-semibold">
                        <span className={usage.text}>
                          {utilization}%
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {proj.budgetHardBlockEnabled ? (
                          <Badge>Fail-Closed (429)</Badge>
                        ) : (
                          <span className="text-label text-fg-muted">Soft warning only</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Tip label="Edit budget allocation">
                            <button aria-label="Edit budget allocation"
                            type="button"
                            onClick={() => {
                              setEditingProject(proj);
                              setBudgetMonthly(String(proj.budgetMonthly));
                              setBudgetHardBlockEnabled(proj.budgetHardBlockEnabled);
                            }}
                            className="p-1.5 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full transition-colors"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          </Tip>

                          <button
                            type="button"
                            onClick={() => handleToggleBlock(proj)}
                            aria-label={proj.isBlocked ? `Unfreeze ${proj.name} (resume gateway requests)` : `Freeze ${proj.name} (blocks all gateway requests)`}
                            title={proj.isBlocked ? 'Unfreeze project (resume gateway requests)' : 'Freeze project (blocks all gateway requests)'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-semibold border transition-colors ${
                              proj.isBlocked
                                ? 'text-success border-success-border hover:bg-success-bg'
                                : 'text-fg-secondary border-line hover:text-critical hover:bg-critical-bg'
                            }`}
                          >
                            {proj.isBlocked ? (
                              <Unlock className="w-3.5 h-3.5" />
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
                            <span>{proj.isBlocked ? 'Unfreeze' : 'Freeze'}</span>
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
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-serif text-lg font-normal text-fg">Create FinOps Project</h3>
              <Tip label="Close">
                <button aria-label="Close"
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              </Tip>
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
                <NumberInput
                  value={budgetMonthly}
                  onValueChange={setBudgetMonthly}
                  range={BUDGET_USD}
                  step={100}
                  prefix="$"
                  aria-label="Monthly budget in USD"
                />
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
                disabled={isSubmitting || !name || !isNumberInRange(budgetMonthly, BUDGET_USD)}
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
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-serif text-lg font-normal text-fg">Edit Budget — {editingProject.name}</h3>
              <Tip label="Close">
                <button aria-label="Close"
                type="button"
                onClick={() => setEditingProject(null)}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              </Tip>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-fg block mb-1.5">Monthly Allocation (USD) *</label>
                <NumberInput
                  value={budgetMonthly}
                  onValueChange={setBudgetMonthly}
                  range={BUDGET_USD}
                  step={100}
                  prefix="$"
                  aria-label="Monthly budget in USD"
                />
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
                disabled={isSubmitting || !isNumberInRange(budgetMonthly, BUDGET_USD)}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Saving...' : 'Save Allocation'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingToggle !== null}
        tone={pendingToggle?.freeze ? 'danger' : 'sensitive'}
        title={`${pendingToggle?.freeze ? 'Freeze' : 'Unfreeze'} Project — ${pendingToggle?.project.name ?? ''}`}
        description={
          pendingToggle?.freeze
            ? 'Blocks all gateway requests for this project until unfrozen.'
            : 'Resumes gateway requests immediately.'
        }
        consequences={
          pendingToggle?.freeze
            ? [
                "Every app or script using this project's gateway keys gets HTTP 429 on each request, starting now.",
                'Test Bench requests for this project are refused too.',
                'Budgets, keys and history are not changed.',
              ]
            : [
                "Apps using this project's gateway keys can send requests again right away.",
                'Requests count against the monthly budget as usual.',
              ]
        }
        reversible={pendingToggle?.freeze ? 'Reversible: press Unfreeze in this table at any time.' : 'Reversible: you can freeze it again at any time.'}
        confirmLabel={pendingToggle?.freeze ? 'Freeze project' : 'Unfreeze project'}
        onConfirm={async () => {
          if (!pendingToggle) return;
          const { project, freeze } = pendingToggle;
          await setBlocked(project, freeze);
          if (freeze) toast.success(`${project.name} is frozen`, 'All gateway requests for it are being rejected.');
          else toast.success(`Traffic resumed for ${project.name}`);
        }}
        onClose={() => setPendingToggle(null)}
      />
    </div>
  );
}
