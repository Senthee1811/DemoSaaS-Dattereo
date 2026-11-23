'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  Check,
  LayoutDashboard,
  FolderKanban,
  KeyRound,
  Network,
  FlaskConical,
  BellRing,
  ScrollText,
  Users,
  CreditCard,
} from 'lucide-react';
import { notifyStorageChange } from '@/lib/client-storage';
import { TOUR_COMPLETED_KEY } from '@/lib/onboarding';
import { NavTab } from '@/components/Sidebar';
import type { SettingsTab } from '@/components/settings/SettingsView';
import { Spinner } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { providerNames } from '@/lib/providers';

interface TourStep {
  step: number;
  tab: NavTab;
  /** Settings section to open when tab is 'settings'. */
  settingsSection?: SettingsTab;
  /** An action the user can run from this step (real API call, never a mock). */
  action?: 'test-alert';
  title: string;
  description: string;
  badge: string;
  icon: React.ElementType;
}

const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    tab: 'overview',
    title: '1. Executive FinOps Telemetry',
    description: 'Understand AI expenditure, Month-to-Date (MTD) burn rates, active budget ceilings, and real-time token telemetry across all workloads.',
    badge: 'Workspace',
    icon: LayoutDashboard,
  },
  {
    step: 2,
    tab: 'projects',
    title: '2. Projects & Budget Limits',
    description: 'Organize AI workloads by project or squad. Set monthly budgets; our fail-closed Redis Lua reservation engine executes sub-5ms checks to enforce spending limits.',
    badge: 'Workspace',
    icon: FolderKanban,
  },
  {
    step: 3,
    tab: 'keys',
    title: '3. Key Vault & Credentials',
    description: `Securely manage upstream provider keys (${providerNames()}) with AES-256-GCM envelope encryption. Plaintext keys are never stored on disk or logged.`,
    badge: 'Governance',
    icon: KeyRound,
  },
  {
    step: 4,
    tab: 'sdk',
    title: '4. Virtual Gateway Tokens',
    description: 'Understand virtual tokens (sg_live_*) and request routing. Drop-in OpenAI-compatible proxy forwards traffic with automatic model translation and zero refactoring.',
    badge: 'Governance',
    icon: Network,
  },
  {
    step: 5,
    tab: 'playground',
    title: '5. Model Test Bench',
    description: 'Test prompts across the models in your catalog. Verify capacity reservations, response latency, and settled cost estimates in real time.',
    badge: 'Workspace',
    icon: FlaskConical,
  },
  {
    step: 6,
    tab: 'alerts',
    title: '6. Alerts & Anomaly Detection',
    description: 'Identify unusual spending patterns and budget thresholds. Automated Z-score outlier detection flags 3-sigma cost spikes. Every alert lands in this feed; with a Slack webhook it is also posted to Slack.',
    badge: 'Governance',
    icon: BellRing,
  },
  {
    step: 7,
    tab: 'settings',
    settingsSection: 'notifications',
    title: '7. Slack Alerts',
    description:
      'Paste your Slack Incoming Webhook URL in Notifications to post budget and anomaly alerts to a channel. Try it: send a real test alert. Without a webhook it is recorded in the Alerts feed only; with one it is queued for Slack and shows Sent or Failed.',
    badge: 'Notifications',
    icon: BellRing,
    action: 'test-alert',
  },
  {
    step: 8,
    tab: 'audit',
    title: '8. Audit Ledger & Compliance',
    description: 'Inspect cryptographic request history, token consumption, and latency metrics. Export RFC-4180 CSV ledgers for financial compliance and cost attribution.',
    badge: 'Governance',
    icon: ScrollText,
  },
  {
    step: 9,
    tab: 'team',
    title: '9. Team & Access Control',
    description: 'Understand workspace roles and permissions (OWNER, ADMIN, MEMBER). Enforce strict tenant isolation and safeguard key access across teams.',
    badge: 'Organization',
    icon: Users,
  },
  {
    step: 10,
    tab: 'billing',
    title: '10. Billing & Subscription Limits',
    description: 'Monitor token quotas and manage subscription plans (Starter, Growth, Enterprise) with automated Stripe Checkout integration.',
    badge: 'Organization',
    icon: CreditCard,
  },
];

interface ProductTourProps {
  isActive: boolean;
  onClose: () => void;
  onNavigateTab: (tab: NavTab, settingsSection?: SettingsTab) => void;
  /** Runs the real test-alert request (POST /api/v1/alerts) and reports the outcome. */
  onSendTestAlert?: () => Promise<void>;
  /**
   * Called only when the user finishes the last step (not on Skip/Escape). The dashboard
   * decides from the shared onboarding check whether that leads anywhere.
   */
  onFinished?: () => void;
}

export function ProductTour({
  isActive,
  onClose,
  onNavigateTab,
  onFinished,
  onSendTestAlert,
}: ProductTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [sendingTest, setSendingTest] = useState(false);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // Declared before the effects that use it (it is also the Escape-key handler)
  // Skip, Escape and finishing all end the tour. Only finishing the last step calls
  // onFinished. The tour records its own completion and never touches the onboarding
  // state: overwriting it used to downgrade set-up users and send them back to /onboarding.
  const endTour = useCallback(
    (finished: boolean) => {
      try {
        localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
      } catch {
        /* storage unavailable */
      }
      notifyStorageChange();
      setCurrentStepIndex(0); // a restarted tour begins at step 1
      onClose();
      if (finished) onFinished?.();
    },
    [onClose, onFinished],
  );
  const handleFinish = useCallback(() => endTour(false), [endTour]);

  // Navigate to corresponding tab when step changes
  useEffect(() => {
    if (isActive && currentStep) {
      onNavigateTab(currentStep.tab, currentStep.settingsSection);
    }
  }, [isActive, currentStepIndex, currentStep, onNavigateTab]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleFinish();
      } else if (e.key === 'ArrowRight' && currentStepIndex < TOUR_STEPS.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
        setCurrentStepIndex((prev) => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStepIndex, handleFinish]);

  if (!isActive || !currentStep) return null;

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      endTour(true);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const Icon = currentStep.icon;
  const progressPct = ((currentStepIndex + 1) / TOUR_STEPS.length) * 100;

  return (
    <aside 
      className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-[420px] bg-surface rounded-card border border-line shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom-5 duration-200"
      aria-label="Product tour guide"
    >
      {/* Top Bar with Badge, Progress & Dismiss */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge tone="accent" mono>{currentStep.badge}</Badge>
          <span className="text-label font-mono text-fg-muted">
            Step {currentStep.step} of {TOUR_STEPS.length}
          </span>
        </div>

        <button
          onClick={handleFinish}
          className="p-1 rounded-full text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors"
          aria-label="Skip tour"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Line */}
      <div className="w-full h-1 bg-surface-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step Content */}
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-field bg-accent-subtle border border-accent-border text-accent flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-serif text-base font-normal text-fg tracking-tight">
            {currentStep.title}
          </h3>
          <p className="text-xs text-fg-secondary leading-relaxed">
            {currentStep.description}
          </p>
          {currentStep.action === 'test-alert' && onSendTestAlert && (
            <button
              type="button"
              disabled={sendingTest}
              onClick={async () => {
                setSendingTest(true);
                try {
                  await onSendTestAlert();
                } finally {
                  setSendingTest(false);
                }
              }}
              className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-accent-border bg-accent-subtle text-accent text-xs font-semibold disabled:opacity-50"
            >
              {sendingTest ? <Spinner /> : <BellRing className="w-3.5 h-3.5" />}
              <span>{sendingTest ? 'Sending…' : 'Send a real test alert'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Navigation Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-line/60">
        <button
          onClick={handleFinish}
          className="text-xs text-fg-muted hover:text-fg transition-colors font-medium"
        >
          Skip tour
        </button>

        <div className="flex items-center gap-2">
          {currentStepIndex > 0 && (
            <button
              onClick={handlePrev}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-line hover:bg-surface-subtle text-xs font-medium text-fg transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}

          <button
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-2xs"
          >
            <span>{currentStepIndex === TOUR_STEPS.length - 1 ? 'Finish tour' : 'Next'}</span>
            {currentStepIndex === TOUR_STEPS.length - 1 ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

