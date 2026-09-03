'use client';

import React, { useState } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Terminal, 
  Layers, 
  ExternalLink, 
  ShieldCheck, 
  Lock,
  Sparkles
} from 'lucide-react';

interface SdkViewProps {
  projects: Array<{ id: string; name: string }>;
}

export function SdkView({ projects }: SdkViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj_copilot');
  const [activeLang, setActiveLang] = useState<'node' | 'python' | 'curl' | 'langchain'>('node');
  const [copied, setCopied] = useState(false);

  const getSnippets = () => {
    return {
      node: `import OpenAI from 'openai';

// Initialize the OpenAI client pointing to the SpendGuard Gateway
const openai = new OpenAI({
  baseURL: 'https://gateway.spendguard.ai/v1',
  apiKey: process.env.SPENDGUARD_API_KEY, // Scoped gateway key
  defaultHeaders: {
    'X-SpendGuard-Project-Id': '${selectedProjectId}' // Bind to project budget
  }
});

async function run() {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // Or 'claude-3-5-sonnet', 'gemini-1.5-pro'
    messages: [{ role: 'user', content: 'Generate quarterly FinOps review metrics.' }]
  });

  console.log(response.choices[0].message.content);
}

run();`,

      python: `import os
from openai import OpenAI

# Initialize SpendGuard AI Proxy client
client = OpenAI(
    base_url="https://gateway.spendguard.ai/v1",
    api_key=os.environ.get("SPENDGUARD_API_KEY"),
    default_headers={
        "X-SpendGuard-Project-Id": "${selectedProjectId}"
    }
)

response = client.chat.completions.create(
    model="claude-3-5-sonnet-20241022",
    messages=[
        {"role": "user", "content": "Analyze AWS cloud spend anomaly report."}
    ]
)

print(response.choices[0].message.content)`,

      curl: `curl -X POST https://gateway.spendguard.ai/v1/chat/completions \\
  -H "Authorization: Bearer $SPENDGUARD_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-SpendGuard-Project-Id: ${selectedProjectId}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Verify fail-closed budget guardrails."
      }
    ],
    "temperature": 0.7
  }'`,

      langchain: `import { ChatOpenAI } from "@langchain/openai";

// Drop SpendGuard endpoint into LangChain / LlamaIndex workflows
const model = new ChatOpenAI({
  modelName: "gpt-4o",
  configuration: {
    baseURL: "https://gateway.spendguard.ai/v1",
    apiKey: process.env.SPENDGUARD_API_KEY,
    defaultHeaders: {
      "X-SpendGuard-Project-Id": "${selectedProjectId}"
    }
  }
});

const res = await model.invoke("Analyze quarterly multi-model inference ledger.");
console.log(res.content);`
    };
  };

  const snippets = getSnippets();
  const currentSnippet = snippets[activeLang];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
          Integration & SDK Guides
        </h2>
        <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
          1-line drop-in configuration for OpenAI SDK, LangChain, LlamaIndex, Python, and cURL.
        </p>
      </div>

      {/* Code Config Box */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-6">
        {/* Top Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F0ECE7]">
          {/* Project Picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#666666]">Bind Scope:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Bind Scope Project"
              className="px-3 py-1.5 rounded-xl border border-[#E8E8E8] text-xs font-semibold text-[#111111] bg-[#FFF8F5] focus:outline-none focus:border-[#FF6B35]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          {/* Language Switcher Tabs */}
          <div className="inline-flex items-center p-1 bg-[#F5F2ED] rounded-xl border border-[#E8E8E8]">
            {[
              { id: 'node', label: 'Node.js (OpenAI SDK)' },
              { id: 'python', label: 'Python' },
              { id: 'curl', label: 'cURL' },
              { id: 'langchain', label: 'LangChain' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveLang(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeLang === tab.id
                    ? 'bg-white text-[#111111] shadow-sm'
                    : 'text-[#666666] hover:text-[#111111]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Terminal Window */}
        <div className="relative rounded-2xl bg-[#111111] text-white p-5 font-mono text-xs overflow-hidden shadow-inner">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2 text-white/50 text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>SpendGuard Drop-In Gateway Client</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#FFA06E]" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto text-[#FFA06E] leading-relaxed select-all">
            <code>{currentSnippet}</code>
          </pre>
        </div>

        {/* Integration Features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFE2D6]">
            <div className="flex items-center gap-2 text-xs font-bold text-[#111111] mb-1">
              <ShieldCheck className="w-4 h-4 text-[#FF6B35]" />
              <span>Fail-Closed Enforced</span>
            </div>
            <p className="text-[11px] text-[#666666]">
              Requests automatically reject with HTTP 429 when monthly cap is crossed.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFE2D6]">
            <div className="flex items-center gap-2 text-xs font-bold text-[#111111] mb-1">
              <Lock className="w-4 h-4 text-[#FF6B35]" />
              <span>Zero-Code Provider Switching</span>
            </div>
            <p className="text-[11px] text-[#666666]">
              Target any OpenAI, Claude, or Gemini model using the standard model parameter.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFE2D6]">
            <div className="flex items-center gap-2 text-xs font-bold text-[#111111] mb-1">
              <Sparkles className="w-4 h-4 text-[#FF6B35]" />
              <span>Custom Telemetry Headers</span>
            </div>
            <p className="text-[11px] text-[#666666]">
              Receive <code className="font-mono text-[#FF6B35]">X-SpendGuard-Cost</code> and latency directly in response headers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
