'use client';

import React, { useState } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Terminal, 
  BookOpen, 
  Cpu, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface SdkViewProps {
  projects: Array<{ id: string; name: string }>;
}

export function SdkView({ projects }: SdkViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj_copilot');
  const [activeLang, setActiveLang] = useState<'python' | 'node' | 'curl' | 'langchain'>('python');
  const [copied, setCopied] = useState(false);

  const getOrigin = () => {
    if (typeof window !== 'undefined') return window.location.origin;
    return 'http://localhost:3000';
  };

  const origin = getOrigin();
  const sampleKey = `sg_live_a94f8b2e_${selectedProjectId}`;

  const SNIPPETS = {
    python: `# 1. Install standard OpenAI client (Zero custom libraries needed)
# pip install openai

import os
from openai import OpenAI

# Initialize client pointing to SpendGuard Governance Gateway
client = OpenAI(
    base_url="${origin}/api/v1",
    api_key="${sampleKey}"  # Project Scoped Gateway Token
)

# Execute request with automatic budget guardrails, cost logging & audit
response = client.chat.completions.create(
    model="gpt-4o",  # Supports 'claude-3-5-sonnet-20241022', 'gemini-1.5-pro', etc.
    messages=[
        {"role": "system", "content": "You are an enterprise AI assistant."},
        {"role": "user", "content": "Optimize our customer support resolution pipeline."}
    ]
)

print(response.choices[0].message.content)

# Cost and token consumption are automatically logged to SpendGuard.
# If project budget is exhausted, client automatically receives a 429 Fail-Closed error.`,

    node: `// 1. Install OpenAI official SDK
// npm install openai

import OpenAI from 'openai';

const spendguard = new OpenAI({
  baseURL: '${origin}/api/v1',
  apiKey: '${sampleKey}' // Project Scoped Gateway Token
});

async function runGovernedAI() {
  try {
    const completion = await spendguard.chat.completions.create({
      model: 'gpt-4o', // or 'claude-3-5-sonnet-20241022', 'gemini-1.5-pro'
      messages: [{ role: 'user', content: 'Generate quarterly financial summary.' }]
    });

    console.log(completion.choices[0].message.content);
  } catch (error) {
    // Fails closed if project budget cap is reached
    if (error.status === 429) {
      console.error('SpendGuard AI Guardrail: Budget exceeded or project frozen.');
    }
  }
}

runGovernedAI();`,

    curl: `# Direct HTTP cURL request through SpendGuard Gateway
curl -X POST "${origin}/api/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -d '{
    "project_id": "${selectedProjectId}",
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello SpendGuard AI"}
    ]
  }'`,

    langchain: `# LangChain Python Integration
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o",
    openai_api_base="${origin}/api/v1",
    openai_api_key="${sampleKey}"
)

response = llm.invoke("Summarize key takeaways from SOC2 audit.")
print(response.content)`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(SNIPPETS[activeLang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Drop-in SDK & Integration Guide</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Zero codebase rewrite: route your OpenAI, LangChain or Anthropic clients through SpendGuard in 2 lines of code.
          </p>
        </div>

        {/* Project Selector */}
        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs">
          <span className="text-slate-400">Target Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Integration Code Card */}
      <div className="glass-card rounded-xl border border-slate-800 overflow-hidden">
        {/* Language Tabs & Copy */}
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
          <div className="flex space-x-2">
            {[
              { id: 'python', label: 'Python (OpenAI SDK)' },
              { id: 'node', label: 'Node.js / TypeScript' },
              { id: 'curl', label: 'cURL HTTP' },
              { id: 'langchain', label: 'LangChain' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveLang(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeLang === tab.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-all"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        {/* Code Content */}
        <div className="p-5 bg-[#080d1a] overflow-x-auto">
          <pre className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
            {SNIPPETS[activeLang]}
          </pre>
        </div>
      </div>

      {/* How It Works 3-Step Flow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="glass-card p-5 rounded-xl border border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center text-xs mb-3">
            1
          </div>
          <h4 className="font-bold text-white text-sm mb-1">Set Base URL</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Change your LLM SDK client `baseURL` to point to SpendGuard. No proprietary wrappers required.
          </p>
        </div>

        <div className="glass-card p-5 rounded-xl border border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs mb-3">
            2
          </div>
          <h4 className="font-bold text-white text-sm mb-1">Pre-Flight Guardrails</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Every call verifies project budget health in under 5ms before proxying to OpenAI, Claude, or Gemini.
          </p>
        </div>

        <div className="glass-card p-5 rounded-xl border border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs mb-3">
            3
          </div>
          <h4 className="font-bold text-white text-sm mb-1">Audit & Anomaly Tracking</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Request metrics, token counts, exact dollar cost, and statistical anomaly flags are logged immutably.
          </p>
        </div>
      </div>
    </div>
  );
}
