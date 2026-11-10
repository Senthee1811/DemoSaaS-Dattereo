'use client';

import React from 'react';
import { 
  ShieldCheck, 
  ArrowRight, 
  Compass, 
  Wrench, 
  X, 
  CheckCircle2, 
  Lock, 
  Zap, 
  Cpu 
} from 'lucide-react';

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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xl p-6 sm:p-8 space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        {/* Close / Skip button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-[#888882] hover:text-[#141413] hover:bg-[#F3F3F0] transition-colors"
          aria-label="Close welcome modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand mark & Heading */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7F2] border border-[#FFD2C0] text-[11px] font-mono text-[#FF6B35]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Workspace Created • Dattreo Studio</span>
          </div>

          <h2 id="welcome-title" className="font-serif text-2xl sm:text-3xl font-normal text-[#141413] tracking-tight">
            Welcome to SpendGuard, {userName}
          </h2>

          <p className="text-xs sm:text-sm text-[#555550] leading-relaxed">
            Your workspace for <strong className="text-[#141413] font-semibold">{orgName}</strong> is initialized. 
            SpendGuard centralizes multi-provider LLM calls, secures API keys with AES-256-GCM envelope encryption, 
            and enforces sub-5ms Redis pre-flight budget reservations.
          </p>
        </div>

        {/* Value Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-1">
          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1.5">
            <div className="w-6 h-6 rounded-full bg-[#FFF7F2] text-[#FF6B35] flex items-center justify-center">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-[#141413]">Key Vault</p>
            <p className="text-[11px] text-[#888882] leading-snug">Zero plaintext leaks with cryptographic envelopes.</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1.5">
            <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-[#141413]">Budget Caps</p>
            <p className="text-[11px] text-[#888882] leading-snug">Fail-closed Lua hard blocks at 100% capacity.</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1.5">
            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-semibold text-[#141413]">Multi-Model</p>
            <p className="text-[11px] text-[#888882] leading-snug">OpenAI, Claude, and Gemini under one gateway.</p>
          </div>
        </div>

        {/* Action Pathways */}
        <div className="space-y-2.5 pt-2">
          {/* Primary Action: Configure Workspace */}
          <button
            onClick={() => {
              onClose();
              onStartOnboarding();
            }}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#FF6B35] hover:bg-[#E55A25] text-white font-medium transition-colors shadow-2xs group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <Wrench className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs sm:text-sm font-semibold">Configure My Workspace</p>
                <p className="text-[11px] text-white/80">Connect provider keys, create project, and issue first token</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 mr-1 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Secondary Action: Explore Product Tour */}
          <button
            onClick={() => {
              onClose();
              onStartTour();
            }}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-white hover:bg-[#FAF8F5] border border-[#E4E4E0] text-[#141413] transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-[#555550]">
                <Compass className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs sm:text-sm font-semibold text-[#141413]">Explore the Product Tour</p>
                <p className="text-[11px] text-[#888882]">Guided 9-step walkthrough of all FinOps governance modules</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 mr-1 text-[#888882] group-hover:text-[#141413] group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Dismiss option */}
        <div className="pt-1 text-center">
          <button
            onClick={onClose}
            className="text-xs text-[#888882] hover:text-[#141413] transition-colors"
          >
            I'll configure this later, take me to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

