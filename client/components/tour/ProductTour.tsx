'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Compass, 
  DollarSign, 
  FolderKanban, 
  Key, 
  Zap, 
  Play, 
  AlertTriangle, 
  FileText, 
  Users, 
  CreditCard 
} from 'lucide-react';
import { NavTab } from '@/components/Sidebar';

interface TourStep {
  step: number;
  tab: NavTab;
  title: string;
  description: string;
  badge: string;
  icon: React.ElementType;
}

const TOUR_STEPS: TourStep[] = [
  {
    step: 1,
    tab: 'overview',
    title: 'Executive FinOps Telemetry',
    description: 'Track Month-to-Date (MTD) expenditure, projected month-end burn rate, and real-time token volume aggregated across all your projects.',
    badge: 'Workspace',
    icon: DollarSign,
  },
  {
    step: 2,
    tab: 'projects',
    title: 'Projects & Hard-Block Limits',
    description: 'Isolate budgets by application or team. When a project hits 100% of its budget, our atomic Redis Lua script enforces instant HTTP 429 hard blocks.',
    badge: 'Workspace',
    icon: FolderKanban,
  },
  {
    step: 3,
    tab: 'keys',
    title: 'Cryptographic Key Vault',
    description: 'Connect OpenAI, Anthropic, and Gemini keys securely sealed with AES-256-GCM envelope encryption. Plaintext keys are never logged or stored on disk.',
    badge: 'Governance',
    icon: Key,
  },
  {
    step: 4,
    tab: 'sdk',
    title: 'Drop-In Virtual Gateway Tokens',
    description: 'Issue scoped sg_live_* tokens. Integrate with Python, Node.js, or cURL by changing just one line: baseURL: "https://api.spendguard.dev/v1".',
    badge: 'Governance',
    icon: Zap,
  },
  {
    step: 5,
    tab: 'playground',
    title: 'Interactive Model Test Bench',
    description: 'Test prompts across GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro. Inspect pre-flight capacity reservations, actual token usage, and sub-5ms proxy latency.',
    badge: 'Workspace',
    icon: Play,
  },
  {
    step: 6,
    tab: 'alerts',
    title: 'Statistical 3-Sigma Anomaly Detection',
    description: 'Automated Z-score outlier modeling detects abnormal cost and token spikes. Receive instant multi-channel alerts in Slack (BlockKit) and Email.',
    badge: 'Governance',
    icon: AlertTriangle,
  },
  {
    step: 7,
    tab: 'audit',
    title: 'Cryptographic Audit Ledger',
    description: 'Immutable, cryptographically verifiable record of every inference call. Download SOC2-ready CSV exports for compliance and financial reconciliation.',
    badge: 'Governance',
    icon: FileText,
  },
  {
    step: 8,
    tab: 'team',
    title: 'Team RBAC & Access Control',
    description: 'Manage permissions across OWNER, ADMIN, and MEMBER roles. Prevent unauthorized project modifications while enabling developers to run tests safely.',
    badge: 'Organization',
    icon: Users,
  },
  {
    step: 9,
    tab: 'billing',
    title: 'Stripe Subscription & Quotas',
    description: 'Monitor token quotas and manage your subscription tier (Starter, Growth, Enterprise) with automated Stripe Checkout and customer portal billing.',
    badge: 'Organization',
    icon: CreditCard,
  },
];

interface ProductTourProps {
  isActive: boolean;
  onClose: () => void;
  onNavigateTab: (tab: NavTab) => void;
}

export function ProductTour({
  isActive,
  onClose,
  onNavigateTab,
}: ProductTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // Navigate to corresponding tab when step changes
  useEffect(() => {
    if (isActive && currentStep) {
      onNavigateTab(currentStep.tab);
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
  }, [isActive, currentStepIndex]);

  if (!isActive || !currentStep) return null;

  const handleNext = () => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('spendguard_tour_completed', 'true');
    }
    onClose();
  };

  const Icon = currentStep.icon;
  const progressPct = ((currentStepIndex + 1) / TOUR_STEPS.length) * 100;

  return (
    <aside 
      className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-[420px] bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom-5 duration-200"
      aria-label="Product tour guide"
    >
      {/* Top Bar with Badge, Progress & Dismiss */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-[#FFF7F2] border border-[#FFD2C0] text-[10px] font-mono font-semibold text-[#FF6B35]">
            {currentStep.badge}
          </span>
          <span className="text-[11px] font-mono text-[#888882]">
            Step {currentStep.step} of {TOUR_STEPS.length}
          </span>
        </div>

        <button
          onClick={handleFinish}
          className="p-1 rounded-full text-[#888882] hover:text-[#141413] hover:bg-[#F3F3F0] transition-colors"
          aria-label="Skip tour"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress Line */}
      <div className="w-full h-1 bg-[#F3F3F0] rounded-full overflow-hidden">
        <div 
          className="h-full bg-[#FF6B35] transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step Content */}
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-2xl bg-[#FFF7F2] border border-[#FFD2C0] text-[#FF6B35] flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-serif text-base font-normal text-[#141413] tracking-tight">
            {currentStep.title}
          </h3>
          <p className="text-xs text-[#555550] leading-relaxed">
            {currentStep.description}
          </p>
        </div>
      </div>

      {/* Footer Navigation Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-[#E4E4E0]/60">
        <button
          onClick={handleFinish}
          className="text-xs text-[#888882] hover:text-[#141413] transition-colors font-medium"
        >
          Skip tour
        </button>

        <div className="flex items-center gap-2">
          {currentStepIndex > 0 && (
            <button
              onClick={handlePrev}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#E4E4E0] hover:bg-[#FAF8F5] text-xs font-medium text-[#141413] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}

          <button
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white text-xs font-semibold transition-colors shadow-2xs"
          >
            <span>{currentStepIndex === TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next'}</span>
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

