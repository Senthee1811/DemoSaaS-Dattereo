'use client';

import React, { useState } from 'react';
import { useScopeId } from '@/lib/scope';
import { SpendBreakdownPanel } from './SpendBreakdownPanel';
import { ForecastPanel } from './ForecastPanel';
import { InvestigationPanel } from './InvestigationPanel';
import { RecommendationsPanel } from './RecommendationsPanel';

type InsightsTab = 'spend' | 'investigate' | 'forecast' | 'actions';

const TABS: Array<{ id: InsightsTab; label: string; question: string }> = [
  { id: 'spend', label: 'Where it goes', question: 'Where is the money going?' },
  { id: 'investigate', label: 'Why it changed', question: 'Why is spend changing?' },
  { id: 'forecast', label: "What's next", question: 'What is likely to happen?' },
  { id: 'actions', label: 'What to do', question: 'What could improve it?' },
];

/**
 * One place for cost understanding. Everything here is computed by the backend from the spend ledger with
 * deterministic rules and is scoped by the global project scope (top-bar dropdown). Four tabs, one per question.
 */
export function InsightsView() {
  const projectId = useScopeId();
  const [tab, setTab] = useState<InsightsTab>('spend');
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-6" data-testid="insights-view">
      <div>
        <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">Cost Insights</h2>
        <p className="text-sm text-fg-secondary mt-1 max-w-2xl">
          Where your AI spend goes, why it changes and what is likely next. Every figure is calculated from your request ledger; forecasts and
          estimates are labelled as such.
        </p>
      </div>

      <div role="tablist" aria-label="Cost insights" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full border text-xs font-semibold transition-colors ${
              tab === t.id ? 'bg-accent-subtle border-accent-border text-accent' : 'bg-surface border-line text-fg-secondary hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-label text-fg-muted -mt-3">{active.question}</p>

      <div role="tabpanel">
        {tab === 'spend' && <SpendBreakdownPanel projectId={projectId} />}
        {tab === 'investigate' && <InvestigationPanel projectId={projectId} />}
        {tab === 'forecast' && <ForecastPanel projectId={projectId} />}
        {tab === 'actions' && <RecommendationsPanel projectId={projectId} />}
      </div>
    </div>
  );
}
