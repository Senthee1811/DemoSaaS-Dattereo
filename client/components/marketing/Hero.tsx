'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Terminal, ShieldCheck, Check, Cpu, Zap, Copy, Code2 } from 'lucide-react';

export function Hero() {
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'node'>('curl');
  const [copied, setCopied] = useState(false);

  const snippets = {
    curl: `curl -X POST https://gateway.spendguard.ai/v1/chat/completions \\
  -H "Authorization: Bearer sg_live_9bac36..." \\
  -H "X-SpendGuard-Project-Id: proj_production" \\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello SpendGuard"}]}'`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="https://gateway.spendguard.ai/v1",
    api_key="sg_live_9bac36...",
    default_headers={"X-SpendGuard-Project-Id": "proj_production"}
)
response = client.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Analyze inference spend."}]
)`,
    node: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://gateway.spendguard.ai/v1',
  apiKey: 'sg_live_9bac36...',
  defaultHeaders: { 'X-SpendGuard-Project-Id': 'proj_production' }
});
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Analyze inference spend.' }]
});`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative w-full pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Hero Header */}
      <div className="max-w-3xl mx-auto text-center space-y-4">
        {/* Release Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F3F3F0] border border-[#E4E4E0] text-xs font-semibold text-[#18191B]">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35]" />
          <span>SpendGuard AI v2.0 Gateway Released</span>
          <span className="text-[#80868B]">|</span>
          <span className="text-[#5F6368]">Sub-5ms Atomic Budgets</span>
        </div>

        {/* Master Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#18191B] leading-[1.1]">
          One gateway. Every model. <br className="hidden sm:inline" />
          <span className="text-[#FF6B35]">Complete cost control.</span>
        </h1>

        {/* Technical Subheadline */}
        <p className="text-base sm:text-lg text-[#5F6368] leading-relaxed max-w-2xl mx-auto">
          Centralize API traffic across OpenAI, Anthropic, and Gemini. Enforce pre-flight atomic budget limits, detect token spikes, and maintain immutable audit ledgers.
        </p>

        {/* Primary CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/register"
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-[#FF6B35] hover:bg-[#E85520] text-white font-semibold text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/login"
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-white hover:bg-[#F3F3F0] text-[#18191B] border border-[#E4E4E0] font-semibold text-sm shadow-xs transition-colors"
          >
            Sign In to Console
          </Link>
        </div>

        {/* Trust Points */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs text-[#5F6368]">
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#0D9488]" />
            <span>Drop-in OpenAI SDK compatible</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#0D9488]" />
            <span>Fail-closed Redis Lua reservations</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#0D9488]" />
            <span>Zero plaintext key storage</span>
          </div>
        </div>
      </div>

      {/* Faithful Faithful Product Preview / Gateway Console */}
      <div className="mt-12 bg-white rounded-xl border border-[#E4E4E0] shadow-sm overflow-hidden max-w-4xl mx-auto">
        {/* Terminal Titlebar */}
        <div className="h-11 px-4 bg-[#FBFBFA] border-b border-[#E4E4E0] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E4E4E0]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E4E4E0]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E4E4E0]" />
            </div>
            <span className="font-mono text-[11px] text-[#5F6368] ml-2">
              https://gateway.spendguard.ai/v1/chat/completions
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[#F3F3F0] p-0.5 rounded">
              {(['curl', 'python', 'node'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    activeTab === tab ? 'bg-white text-[#18191B] shadow-2xs' : 'text-[#5F6368]'
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-[#5F6368] hover:text-[#18191B] hover:bg-[#F3F3F0]"
              title="Copy snippet"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#0D9488]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="p-5 bg-[#18191B] text-[#ECECE8] font-mono text-xs overflow-x-auto leading-relaxed">
          <code>{snippets[activeTab]}</code>
        </div>

        {/* Live Operational Metrics Footer */}
        <div className="p-3.5 bg-[#FBFBFA] border-t border-[#E4E4E0] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-[#5F6368] uppercase font-semibold block">Gateway Latency</span>
            <span className="font-mono tabular-nums font-bold text-[#18191B]">3.2ms overhead</span>
          </div>
          <div>
            <span className="text-[10px] text-[#5F6368] uppercase font-semibold block">Budget Reservation</span>
            <span className="font-mono tabular-nums font-bold text-[#0D9488]">Pre-Flight Atomic</span>
          </div>
          <div>
            <span className="text-[10px] text-[#5F6368] uppercase font-semibold block">Supported Models</span>
            <span className="font-mono text-[#18191B]">OpenAI, Claude, Gemini</span>
          </div>
          <div>
            <span className="text-[10px] text-[#5F6368] uppercase font-semibold block">Key Encryption</span>
            <span className="font-mono text-[#18191B]">AES-256-GCM Envelope</span>
          </div>
        </div>
      </div>
    </section>
  );
}
