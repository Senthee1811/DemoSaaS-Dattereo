'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal, CheckCircle2 } from 'lucide-react';

export function CtaBanner() {
  return (
    <section className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-310 mx-auto">
      <div className="rounded-card bg-inversion-dark border border-[#2A2A28] text-white p-8 sm:p-14 lg:p-16 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#242422] border border-[#333330] text-xs font-mono text-[#D6D6D0]">
            <Terminal className="w-3.5 h-3.5 text-[#FF6B35]" />
            <span>npm install @spendguard/sdk · by Dattreo</span>
          </div>

          {/* Heading — Refined Serif */}
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-white leading-tight">
            Take deterministic control over your AI spend
          </h2>

          {/* Subtitle */}
          <p className="text-sm sm:text-base text-[#A0A09B] max-w-xl mx-auto leading-relaxed font-sans font-normal">
            Eliminate runaway LLM billing before it starts. Enforce sub-5ms Redis budget reservations, fail-closed thresholds, and centralized key rotation across all teams.
          </p>

          {/* Architecture Guarantees Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
            <div className="p-3.5 rounded-menu bg-[#1B1B1A] border border-[#2A2A28]">
              <span className="text-caption font-mono text-[#888882] block uppercase">Verification Latency</span>
              <span className="text-sm font-mono font-bold text-white tabular-nums">&lt; 5.0ms (Redis Lua)</span>
            </div>
            <div className="p-3.5 rounded-menu bg-[#1B1B1A] border border-[#2A2A28]">
              <span className="text-caption font-mono text-[#888882] block uppercase">Over-Budget Mode</span>
              <span className="text-sm font-mono font-bold text-[#FF6B35]">Fail-Closed HTTP 429</span>
            </div>
            <div className="p-3.5 rounded-menu bg-[#1B1B1A] border border-[#2A2A28]">
              <span className="text-caption font-mono text-[#888882] block uppercase">Key Storage</span>
              <span className="text-sm font-mono font-bold text-white">AES-256-GCM Envelope</span>
            </div>
          </div>

          {/* Pill CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-4">
            <Link
              href="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold text-white bg-[#FF6B35] hover:bg-[#E55A25] transition-colors shadow-2xs"
            >
              <span>Create Organization</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3 rounded-full text-sm font-semibold text-[#D6D6D0] bg-[#242422] border border-[#333330] hover:bg-[#2A2A28] hover:text-white transition-colors"
            >
              <span>Explore Live Console</span>
            </Link>
          </div>

          {/* Operational Guarantees */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-[#888882] font-sans">
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
