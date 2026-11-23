'use client';

import React from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Compass,
  FolderKanban,
  X,
  Lock,
  Zap,
  Cpu,
} from 'lucide-react';
import { useEscapeToClose } from '@/components/ui/feedback';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartOnboarding: () => void;
  onStartTour: () => void;
  userName?: string;
  orgName?: string;
}

export function WelcomeModal({
  isOpen,
  onClose,
  onStartOnboarding,
  onStartTour,
  userName = 'there',
  orgName = 'your organization',
}: WelcomeModalProps) {
  useEscapeToClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl bg-surface rounded-card border border-line shadow-2xl p-6 sm:p-8 space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        {/* Close / Skip button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors"
          aria-label="Close welcome modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand mark & Heading */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-subtle border border-accent-border text-label font-mono text-accent">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Workspace Created • Dattreo Studio</span>
          </div>

          <h2 id="welcome-title" className="font-serif text-2xl sm:text-3xl font-normal text-fg tracking-tight">
            Welcome to SpendGuard, {userName}
          </h2>

          <p className="text-xs sm:text-sm text-fg-secondary leading-relaxed">
            Your workspace for <strong className="text-fg font-semibold">{orgName}</strong> is initialized. 
            SpendGuard centralizes multi-provider LLM calls, secures API keys with AES-256-GCM envelope encryption, 
            and enforces sub-5ms Redis pre-flight budget reservations.
          </p>
        </div>

        {/* Value Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-1">
          <div className="p-3.5 rounded-field bg-surface-subtle border border-line-strong space-y-1.5">
            <div className="w-6 h-6 rounded-full bg-accent-subtle text-accent flex items-center justify-center">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-fg">Key Vault</p>
            <p className="text-label text-fg-muted leading-snug">Zero plaintext leaks with cryptographic envelopes.</p>
          </div>

          <div className="p-3.5 rounded-field bg-surface-subtle border border-line-strong space-y-1.5">
            <div className="w-6 h-6 rounded-full bg-success-bg text-success flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-fg">Budget Caps</p>
            <p className="text-label text-fg-muted leading-snug">Fail-closed Lua hard blocks at 100% capacity.</p>
          </div>

          <div className="p-3.5 rounded-field bg-surface-subtle border border-line-strong space-y-1.5">
            <div className="w-6 h-6 rounded-full bg-blue-50 text-info flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-fg">Multi-Model</p>
            <p className="text-label text-fg-muted leading-snug">OpenAI, Claude, and Gemini under one gateway.</p>
          </div>
        </div>

        {/* Action Pathways */}
        <div className="space-y-2.5 pt-2">
          {/* Primary Action: Interactive Product Tour */}
          <button
            onClick={() => {
              onClose();
              onStartTour();
            }}
            className="w-full flex items-center justify-between p-3.5 rounded-field bg-accent hover:bg-accent-hover text-white font-medium transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <Compass className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs sm:text-sm font-semibold">Start Interactive Product Tour</p>
                  <span className="text-caption px-1.5 py-0.2 rounded-full bg-surface text-accent font-mono font-bold uppercase tracking-wider">
                    Recommended
                  </span>
                </div>
                <p className="text-label text-white/80">9-step walkthrough of spend telemetry, budget caps, and virtual gateway</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 mr-1 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Secondary Action: Direct Workspace Onboarding */}
          <button
            onClick={() => {
              onClose();
              onStartOnboarding();
            }}
            className="w-full flex items-center justify-between p-3.5 rounded-field bg-surface hover:bg-surface-subtle border border-line text-fg transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-subtle border border-line-strong flex items-center justify-center text-fg-secondary">
                <FolderKanban className="w-4 h-4 text-fg-secondary" />
              </div>
              <div className="text-left">
                <p className="text-xs sm:text-sm font-semibold text-fg">Skip Tour & Configure Workspace</p>
                <p className="text-label text-fg-muted">Jump straight into Key Vault setup, project budgets, and gateway tokens</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 mr-1 text-fg-muted group-hover:text-fg group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Dismiss option */}
        <div className="pt-1 text-center">
          <button
            onClick={onClose}
            className="text-xs text-fg-muted hover:text-fg transition-colors"
          >
            I&apos;ll configure this later, take me to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

