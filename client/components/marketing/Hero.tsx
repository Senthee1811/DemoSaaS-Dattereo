'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { Tip } from '@/components/ui/tooltip';

export function Hero() {
  const [activeTab, setActiveTab] = useState<'curl' | 'python' | 'node'>('curl');
  const [copied, setCopied] = useState(false);

  const snippets = {
    curl: `curl -X POST https://gateway.spendguard.ai/v1/chat/completions \\
  -H "Authorization: Bearer sg_live_9bac36..." \\
  -H "X-SpendGuard-Project-Id: proj_production" \\
  -d '{"model": "gpt-6.2-sol", "messages": [{"role": "user", "content": "Hello SpendGuard"}]}'`,
    python: `from openai import OpenAI

client = OpenAI(
    base_url="https://gateway.spendguard.ai/v1",
    api_key="sg_live_9bac36...",
    default_headers={"X-SpendGuard-Project-Id": "proj_production"}
)
response = client.chat.completions.create(
    model="claude-sonnet-5-5",
    messages=[{"role": "user", "content": "Analyze inference spend."}]
)`,
    node: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://gateway.spendguard.ai/v1',
  apiKey: 'sg_live_9bac36...',
  defaultHeaders: { 'X-SpendGuard-Project-Id': 'proj_production' }
});
const response = await client.chat.completions.create({
  model: 'gpt-6.2-sol',
  messages: [{ role: 'user', content: 'Analyze inference spend.' }]
});`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative w-full pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-310 mx-auto">
      {/* Hero Header — Editorial Composition */}
      <div className="max-w-3xl mx-auto text-center space-y-5">
        {/* Release Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFFFFF] border border-parchment-border text-xs font-mono text-[#555550] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35]" />
          <span>SpendGuard AI · by Dattreo</span>
          <span className="text-[#C4BFB8]">|</span>
          <span className="text-[#666660]">Sub-5ms Pre-Flight Guardrails</span>
        </div>

        {/* Master Headline in Refined Editorial Serif */}
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-[62px] font-normal tracking-tight text-inversion-dark leading-[1.08]">
          One gateway. Every model. <br className="hidden sm:inline" />
          <span className="italic font-normal text-[#FF6B35]">Complete cost control.</span>
        </h1>

        {/* Technical Subheadline */}
        <p className="text-base sm:text-lg text-[#555550] leading-relaxed max-w-2xl mx-auto font-sans font-normal">
          Centralize LLM usage across OpenAI, Anthropic, and Google Gemini. Enforce pre-flight atomic budget reservations, halt runaway token loops, and maintain cryptographically verified audit ledgers.
        </p>

        {/* Primary Pill CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
          <Link
            href="/register"
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-white hover:bg-[#F7F5F0] text-inversion-dark border border-parchment-border font-semibold text-sm transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          >
            Explore Live Console
          </Link>
        </div>

        {/* Architectural Guarantees */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-3 text-xs text-[#666660]">
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#0D9488]" strokeWidth={2.5} />
            <span>Drop-in OpenAI SDK compatible</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#0D9488]" strokeWidth={2.5} />
            <span>Fail-closed Redis Lua capacity check</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-[#0D9488]" strokeWidth={2.5} />
            <span>Zero prompt retention & AES-256 vault</span>
          </div>
        </div>
      </div>

      {/* Editorial Gateway Console Artefact */}
      <div className="mt-14 bg-inversion-dark rounded-field border border-[#2A2A28] shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden max-w-4xl mx-auto text-white">
        {/* Terminal Titlebar */}
        <div className="h-11 px-5 bg-[#1B1B1A] border-b border-[#2A2A28] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#333330]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#333330]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#333330]" />
            </div>
            <span className="font-mono text-label text-[#A0A09B] ml-2">
              https://gateway.spendguard.ai/v1/chat/completions
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[#242422] p-0.5 rounded-full border border-[#333330]">
              {(['curl', 'python', 'node'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-0.5 rounded-full text-label font-mono transition-colors ${
                    activeTab === tab
                      ? 'bg-[#333330] text-white font-semibold'
                      : 'text-[#888882] hover:text-white'
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <Tip label="Copy snippet">
              <button aria-label="Copy snippet"
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-control hover:bg-[#2A2A28] text-[#A0A09B] hover:text-white transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            </Tip>
          </div>
        </div>

        {/* Code Snippet Box */}
        <div className="p-5 font-mono text-xs overflow-x-auto leading-relaxed text-[#D6D6D0]">
          <pre>{snippets[activeTab]}</pre>
        </div>

        {/* Operational Telemetry Footer */}
        <div className="px-5 py-3 bg-[#1B1B1A] border-t border-[#2A2A28] flex flex-wrap items-center justify-between gap-4 text-label font-mono text-[#A0A09B]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              STATUS: 200 OK
            </span>
            <span>PRE-FLIGHT: 3.2ms</span>
            <span>MODEL: gpt-6.2-sol / claude-sonnet-5-5</span>
          </div>
          <span className="text-[#888882]">RESERVATION: ATOMIC_LUA_OK</span>
        </div>
      </div>
    </section>
  );
}
