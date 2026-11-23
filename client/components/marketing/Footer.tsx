'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, CheckCircle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full bg-inversion-dark border-t border-[#2A2A28] pt-16 pb-12 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-310 mx-auto">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#2A2A28]">
          {/* Brand Info (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#FF6B35] flex items-center justify-center text-white">
                <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.2} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-lg font-normal tracking-tight text-white">
                  SpendGuard <span className="text-[#FF6B35]">AI</span>
                </span>
                <span className="text-caption font-mono text-[#888882]">by Dattreo</span>
              </div>
            </Link>

            <p className="text-xs text-[#A0A09B] max-w-sm leading-relaxed font-sans">
              Real-time AI spend governance, sub-5ms Redis budget guardrails, and cryptographic token audit ledgers. Built by <a href="https://www.dattreo.com" target="_blank" rel="noopener noreferrer" className="text-[#D6D6D0] hover:text-[#FF6B35] underline underline-offset-2 transition-colors">Dattreo</a>.
            </p>

            <div className="flex items-center gap-4 text-label font-mono text-[#888882] pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#FF6B35]" />
                AES-256-GCM Vault
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                Zero Prompt Retention
              </span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3 font-sans">
            <h4 className="text-label font-mono uppercase tracking-wider text-[#A0A09B]">Platform</h4>
            <ul className="space-y-2 text-xs text-[#888882]">
              <li><a href="#demo" className="hover:text-white transition-colors">Interactive Gateway</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Atomic Budget Engine</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Key Vault Encryption</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Spike Anomaly Detection</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">FinOps Audit Ledger</a></li>
            </ul>
          </div>

          {/* Providers & SDKs */}
          <div className="space-y-3 font-sans">
            <h4 className="text-label font-mono uppercase tracking-wider text-[#A0A09B]">Integrations</h4>
            <ul className="space-y-2 text-xs text-[#888882]">
              <li><span className="text-white font-mono text-label">OpenAI</span></li>
              <li><span className="text-white font-mono text-label">Anthropic</span></li>
              <li><span className="text-white font-mono text-label">Google (Gemini)</span></li>
              <li><span className="text-white font-mono text-label">OpenAI SDK Drop-in</span></li>
              <li><span className="text-white font-mono text-label">LangChain &amp; LlamaIndex</span></li>
            </ul>
          </div>

          {/* Studio & Legal */}
          <div className="space-y-3 font-sans">
            <h4 className="text-label font-mono uppercase tracking-wider text-[#A0A09B]">Studio</h4>
            <ul className="space-y-2 text-xs text-[#888882]">
              <li><a href="https://www.dattreo.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#FF6B35] transition-colors">Dattreo Studio</a></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">FinOps Console</Link></li>
              <li><a href="#pricing" className="hover:text-white transition-colors">Pricing &amp; Quotas</a></li>
              <li><a href="#faq" className="hover:text-white transition-colors">Architecture FAQ</a></li>
              <li><span className="hover:text-white transition-colors cursor-pointer">Security Portal</span></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-label font-mono text-[#888882]">
          <p>© {new Date().getFullYear()} SpendGuard AI · A Dattreo Studio Company. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="hover:text-white cursor-pointer">Privacy Policy</span>
            <span className="hover:text-white cursor-pointer">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
