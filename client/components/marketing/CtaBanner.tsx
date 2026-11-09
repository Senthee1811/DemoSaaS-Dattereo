'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal, Shield, CheckCircle2 } from 'lucide-react';

export function CtaBanner() {
  return (
    <section className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      <div className="rounded-xl bg-[#18191B] border border-[#2A2B2E] text-white p-8 sm:p-12 lg:p-16">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#2A2B2E] border border-[#3A3B3E] text-xs font-mono text-[#D0D0D0]">
            <Terminal className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>npm install @spendguard/sdk</span>
          </div>

          {/* Heading */}
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
            Take deterministic control over your AI spend
          </h2>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-[#A0A0A0] max-w-xl mx-auto leading-relaxed">
            Eliminate runaway LLM billing before it starts. Enforce sub-5ms Redis budget reservations, fail-closed thresholds, and centralized key rotation across all teams.
          </p>

          {/* Architecture Guarantees Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
            <div className="p-3 rounded-lg bg-[#222326] border border-[#2E3033]">
              <span className="text-[10px] font-mono text-[#888888] block uppercase">Verification Latency</span>
              <span className="text-sm font-mono font-bold text-white tabular-nums">&lt; 5.0ms (Redis Lua)</span>
            </div>
            <div className="p-3 rounded-lg bg-[#222326] border border-[#2E3033]">
              <span className="text-[10px] font-mono text-[#888888] block uppercase">Over-Budget Enforcement</span>
              <span className="text-sm font-mono font-bold text-[#FF6B35]">Fail-Closed HTTP 429</span>
            </div>
            <div className="p-3 rounded-lg bg-[#222326] border border-[#2E3033]">
              <span className="text-[10px] font-mono text-[#888888] block uppercase">Key Storage</span>
              <span className="text-sm font-mono font-bold text-white">AES-256-GCM Envelope</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-white bg-[#FF6B35] hover:bg-[#E55A25] transition-colors"
            >
              <span>Create Organization</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 rounded-md text-sm font-semibold text-[#D0D0D0] bg-[#222326] border border-[#3A3B3E] hover:bg-[#2A2B2E] hover:text-white transition-colors"
            >
              <span>Explore Live Dashboard</span>
            </Link>
          </div>

          {/* Operational Guarantees */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-5 text-xs text-[#888888]">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6B35]" />
              Zero prompt retention
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6B35]" />
              Drop-in OpenAI SDK compatible
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#FF6B35]" />
              14-day full feature trial
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
