'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, Activity, CheckCircle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full bg-[#FBFBFA] border-t border-[#E4E4E0] pt-16 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1240px] mx-auto">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#E4E4E0]">
          {/* Brand Info (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-[#FF6B35] flex items-center justify-center text-white">
                <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.2} />
              </div>
              <span className="font-bold text-base tracking-tight text-[#18191B]">
                SpendGuard <span className="text-[#FF6B35]">AI</span>
              </span>
            </Link>

            <p className="text-xs text-[#5F6368] max-w-sm leading-relaxed">
              Real-time spend governance and cost control gateway for engineering teams deploying OpenAI, Anthropic, and Google Gemini.
            </p>

            <div className="flex items-center gap-4 text-[11px] font-mono text-[#737373] pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#FF6B35]" />
                AES-256-GCM Vault
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                Zero Prompt Retention
              </span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-[#18191B]">Platform</h4>
            <ul className="space-y-2 text-xs text-[#5F6368]">
              <li><a href="#how-it-works" className="hover:text-[#18191B] transition-colors">Unified AI Gateway</a></li>
              <li><a href="#features" className="hover:text-[#18191B] transition-colors">Atomic Budget Engine</a></li>
              <li><a href="#features" className="hover:text-[#18191B] transition-colors">Key Vault Encryption</a></li>
              <li><a href="#features" className="hover:text-[#18191B] transition-colors">Spike Anomaly Detection</a></li>
              <li><a href="#features" className="hover:text-[#18191B] transition-colors">FinOps Audit Ledger</a></li>
            </ul>
          </div>

          {/* Providers & SDKs */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-[#18191B]">Integrations</h4>
            <ul className="space-y-2 text-xs text-[#5F6368]">
              <li><span className="text-[#18191B] font-mono">OpenAI (GPT-4o, o1)</span></li>
              <li><span className="text-[#18191B] font-mono">Anthropic (Claude 3.5)</span></li>
              <li><span className="text-[#18191B] font-mono">Google (Gemini 1.5 Pro)</span></li>
              <li><span className="text-[#18191B] font-mono">OpenAI SDK Drop-in</span></li>
              <li><span className="text-[#18191B] font-mono">LangChain &amp; LlamaIndex</span></li>
            </ul>
          </div>

          {/* FinOps & Compliance */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-mono uppercase tracking-wider text-[#18191B]">Resources</h4>
            <ul className="space-y-2 text-xs text-[#5F6368]">
              <li><Link href="/dashboard" className="hover:text-[#18191B] transition-colors">Live FinOps Console</Link></li>
              <li><a href="#pricing" className="hover:text-[#18191B] transition-colors">Pricing &amp; Quotas</a></li>
              <li><a href="#faq" className="hover:text-[#18191B] transition-colors">Architecture FAQ</a></li>
              <li><span className="hover:text-[#18191B] transition-colors cursor-pointer">Security Compliance</span></li>
              <li><span className="hover:text-[#18191B] transition-colors cursor-pointer">API Reference</span></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-mono text-[#737373]">
          <p>© {new Date().getFullYear()} SpendGuard AI Inc. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-1.5 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Gateway Status: Operational (99.99%)
            </span>
            <span className="hover:text-[#18191B] cursor-pointer">Privacy</span>
            <span className="hover:text-[#18191B] cursor-pointer">Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
