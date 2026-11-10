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
  FlaskConical 
} from 'lucide-react';

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
      label: 'Connect an AI provider key (OpenAI, Anthropic, Gemini)',
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
    <div className="bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs overflow-hidden">
      {/* Header bar */}
      <div className="p-5 flex items-center justify-between border-b border-[#E4E4E0]/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#FFF7F2] border border-[#FFD2C0] flex items-center justify-center text-[#FF6B35]">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-base font-normal text-[#141413] tracking-tight">
                FinOps Activation Checklist
              </h3>
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[#FAF8F5] border border-[#E5E0D8] text-[#555550]">
                {completedCount} of {tasks.length} completed ({progressPct}%)
              </span>
            </div>
            <p className="text-xs text-[#888882]">
              Follow these recommended steps to establish fail-closed financial guardrails.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-full hover:bg-[#F3F3F0] text-[#888882] hover:text-[#141413] transition-colors"
          aria-label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
        >
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-[#F3F3F0]">
        <div 
          className="h-full bg-[#FF6B35] transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Checklist items */}
      {!isCollapsed && (
        <div className="p-5 space-y-3">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <div
                key={task.id}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-colors ${
                  task.isComplete
                    ? 'bg-[#FAF8F5]/60 border-[#E5E0D8]/60 text-[#888882]'
                    : 'bg-white border-[#E4E4E0] text-[#141413] hover:border-[#FFD2C0]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {task.isComplete ? (
                    <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-[#C4BFB8] shrink-0" />
                  )}
                  <span className={`text-xs sm:text-sm ${task.isComplete ? 'line-through text-[#888882]' : 'font-medium'}`}>
                    {task.label}
                  </span>
                </div>

                {!task.isComplete && (
                  <button
                    onClick={task.action}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#FAF8F5] hover:bg-[#FFF7F2] border border-[#E5E0D8] hover:border-[#FFD2C0] text-xs font-semibold text-[#141413] hover:text-[#FF6B35] transition-colors shrink-0"
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

