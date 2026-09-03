'use client';

import React from 'react';
import Link from 'next/link';
import { Shield, ArrowRight, Lock, CheckCircle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full bg-white border-t border-[#E8E8E8] pt-16 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1240px] mx-auto">
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#F0ECE7]">
          
          {/* Brand Info (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF6B35] to-[#FF8A4C] flex items-center justify-center text-white shadow-md shadow-[#FF6B35]/20">
                <Shield className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
              </div>
              <span className="font-bold text-lg tracking-tight text-[#111111]">
                SpendGuard <span className="text-[#FF6B35]">AI</span>
              </span>
            </Link>

            <p className="text-sm text-[#666666] max-w-sm leading-relaxed">
              The real-time spend governance and accountability platform for engineering and FinOps teams using OpenAI, Gemini, and Claude.
            </p>

            <div className="flex items-center gap-4 text-xs text-[#777777] pt-2">
              <span className="inline-flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-[#FF6B35]" />
                AES-256 Encrypted
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                SOC2 Type II Ready
              </span>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Product</h4>
            <ul className="space-y-2.5 text-sm text-[#666666]">
              <li><a href="#how-it-works" className="hover:text-[#FF6B35] transition-colors">Unified Gateway</a></li>
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Budget Guardrails</a></li>
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Key Management</a></li>
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Spike Anomaly Detection</a></li>
              <li><a href="#features" className="hover:text-[#FF6B35] transition-colors">Immutable Audit Logs</a></li>
            </ul>
          </div>

          {/* Providers & Integrations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Providers</h4>
            <ul className="space-y-2.5 text-sm text-[#666666]">
              <li><span className="text-[#555555]">OpenAI (GPT-4o, o1)</span></li>
              <li><span className="text-[#555555]">Anthropic (Claude 3.5)</span></li>
              <li><span className="text-[#555555]">Google (Gemini 1.5 Pro)</span></li>
              <li><span className="text-[#555555]">OpenAI SDK Drop-in</span></li>
              <li><span className="text-[#555555]">LangChain & LlamaIndex</span></li>
            </ul>
          </div>

          {/* Company & Legal */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Company</h4>
            <ul className="space-y-2.5 text-sm text-[#666666]">
              <li><Link href="/dashboard" className="hover:text-[#FF6B35] transition-colors">Live Dashboard</Link></li>
              <li><a href="#pricing" className="hover:text-[#FF6B35] transition-colors">Pricing Plans</a></li>
              <li><a href="#faq" className="hover:text-[#FF6B35] transition-colors">Security & FAQ</a></li>
              <li><a href="#" className="hover:text-[#FF6B35] transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-[#FF6B35] transition-colors">Terms of Service</a></li>
            </ul>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#888888]">
          <p>© {new Date().getFullYear()} SpendGuard AI Inc. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-[#111111] transition-colors">Status</a>
            <a href="#" className="hover:text-[#111111] transition-colors">Security Portal</a>
            <a href="#" className="hover:text-[#111111] transition-colors">API Docs</a>
          </div>
        </div>

      </div>
    </footer>
  );
}
