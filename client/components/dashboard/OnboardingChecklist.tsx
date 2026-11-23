'use client';

import React, { useState } from 'react';
import {
  CircleCheck,
  Circle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  KeyRound,
  FolderKanban,
  DollarSign,
  Network,
  FlaskConical,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { providerNames } from '@/lib/providers';
import { Tip } from '@/components/ui/tooltip';

interface OnboardingChecklistProps {
  projectsCount: number;
  hasProviderKeys: boolean;
  hasGatewayKeys: boolean;
  totalRequests: number;
  onNavigateToProjects: () => void;
  onNavigateToKeys: () => void;
  onNavigateToPlayground: () => void;
}

export function OnboardingChecklist({
  projectsCount,
  hasProviderKeys,
  hasGatewayKeys,
  totalRequests,
  onNavigateToProjects,
  onNavigateToKeys,
  onNavigateToPlayground,
}: OnboardingChecklistProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Derive task completion states from verified backend data
  const tasks = [
    {
      id: 'provider',
      label: `Connect an AI provider key (${providerNames()})`,
      isComplete: hasProviderKeys,
      action: onNavigateToKeys,
      actionLabel: 'Connect Provider',
      icon: KeyRound,
    },
    {
      id: 'project',
      label: 'Create your first FinOps project & assign team',
      isComplete: projectsCount > 0,
      action: onNavigateToProjects,
      actionLabel: 'Create Project',
      icon: FolderKanban,
    },
    {
      id: 'budget',
      label: 'Configure monthly spend cap & 80% warning threshold',
      isComplete: projectsCount > 0, // In SpendGuard, all projects are created with a default budget cap
      action: onNavigateToProjects,
      actionLabel: 'Review Limits',
      icon: DollarSign,
    },
    {
      id: 'token',
      label: 'Generate a scoped virtual gateway token (sg_live_*)',
      isComplete: hasGatewayKeys,
      action: onNavigateToKeys,
      actionLabel: 'Issue Token',
      icon: Network,
    },
    {
      id: 'request',
      label: 'Execute your first request through the gateway or Test Bench',
      isComplete: totalRequests > 0,
      action: onNavigateToPlayground,
      actionLabel: 'Open Test Bench',
      icon: FlaskConical,
    },
  ];

  const completedCount = tasks.filter((t) => t.isComplete).length;
  const progressPct = Math.round((completedCount / tasks.length) * 100);

  // If all completed and user chose to hide it, we don't show it
  if (completedCount === tasks.length && isCollapsed) {
    return null;
  }

  return (
    <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
      {/* Header bar */}
      <div className="p-5 flex items-center justify-between border-b border-line/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-subtle border border-accent-border flex items-center justify-center text-accent">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-base font-normal text-fg tracking-tight">
                FinOps Activation Checklist
              </h3>
              <Badge mono>{completedCount} of {tasks.length} completed ({progressPct}%)</Badge>
            </div>
            <p className="text-xs text-fg-muted">
              Follow these recommended steps to establish fail-closed financial guardrails.
            </p>
          </div>
        </div>

        <Tip label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}>
          <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-full hover:bg-surface-muted text-fg-muted hover:text-fg transition-colors"
          aria-label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        </Tip>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-surface-muted">
        <div 
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Checklist items */}
      {!isCollapsed && (
        <div className="p-5 space-y-3">
          {tasks.map((task) => {
            return (
              <div
                key={task.id}
                className={`flex items-center justify-between p-3 rounded-field border transition-colors ${
                  task.isComplete
                    ? 'bg-surface-subtle/60 border-line-strong/60 text-fg-muted'
                    : 'bg-surface border-line text-fg hover:border-accent-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  {task.isComplete ? (
                    <CircleCheck className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-fg-muted shrink-0" />
                  )}
                  <span className={`text-xs sm:text-sm ${task.isComplete ? 'line-through text-fg-muted' : 'font-medium'}`}>
                    {task.label}
                  </span>
                </div>

                {!task.isComplete && (
                  <button
                    onClick={task.action}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-subtle hover:bg-accent-subtle border border-line-strong hover:border-accent-border text-xs font-semibold text-fg hover:text-accent transition-colors shrink-0"
                  >
                    <span>{task.actionLabel}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

