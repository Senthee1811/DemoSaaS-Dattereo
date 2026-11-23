'use client';

import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
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

// Point the standard OpenAI client directly to SpendGuard Gateway
const openai = new OpenAI({
  baseURL: 'https://gateway.spendguard.ai/v1',
  apiKey: process.env.SPENDGUARD_API_KEY, // Scoped gateway key: sg_live_...
  defaultHeaders: {
    'X-SpendGuard-Project-Id': '${selectedProjectId}' // Pre-flight atomic budget scoping
  }
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'gpt-6.2-sol', // Or 'claude-sonnet-5-5', 'gemini-3.1-pro-preview'
    messages: [{ role: 'user', content: 'Generate quarterly FinOps spend review.' }]
  });

  console.log(completion.choices[0].message.content);
}

main();`,

      python: `import os
from openai import OpenAI

# SpendGuard unified proxy client
client = OpenAI(
    base_url="https://gateway.spendguard.ai/v1",
    api_key=os.environ.get("SPENDGUARD_API_KEY"),
    default_headers={
        "X-SpendGuard-Project-Id": "${selectedProjectId}"
    }
)

response = client.chat.completions.create(
    model="claude-sonnet-5-5",
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
    "model": "gpt-6.2-sol",
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
  modelName: "gpt-6.2-sol",
  configuration: {
    baseURL: "https://gateway.spendguard.ai/v1",
    apiKey: process.env.SPENDGUARD_API_KEY,
    defaultHeaders: {
      "X-SpendGuard-Project-Id": "${selectedProjectId}"
    }
  }
});

const response = await model.invoke("Analyze quarterly multi-model inference ledger.");
console.log(response.content);`
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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">
          SDK & Gateway Integration
        </h2>
        <p className="text-xs text-fg-secondary mt-1">
          SpendGuard AI exposes a 100% OpenAI-compatible endpoint. Swap your `baseURL` and enforce budget guardrails with zero code rewrites.
        </p>
      </div>

      {/* Integration Workspace */}
      <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3 bg-surface-subtle">
          {/* Language Tabs */}
          <div className="flex items-center gap-1.5 p-0.5 rounded-full bg-surface-muted border border-line-strong">
            {(['node', 'python', 'curl', 'langchain'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActiveLang(lang)}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  activeLang === lang
                    ? 'bg-surface text-fg shadow-xs'
                    : 'text-fg-secondary hover:text-fg'
                }`}
              >
                {lang === 'node' ? 'Node.js' : lang === 'python' ? 'Python' : lang === 'curl' ? 'cURL' : 'LangChain'}
              </button>
            ))}
          </div>

          {/* Project Scoping & Copy */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-fg-secondary">Bind Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-surface border border-line rounded-full px-3 py-1 text-xs text-fg font-medium cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-surface hover:bg-surface-muted text-fg border border-line rounded-full text-xs font-semibold shadow-xs transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-fg-secondary" />}
              <span>{copied ? 'Copied' : 'Copy Snippet'}</span>
            </button>
          </div>
        </div>

        {/* Code Box */}
        <pre className="p-5 bg-code text-[#ECECE8] font-mono text-xs overflow-x-auto leading-relaxed border-t border-white/10">
          <code>{currentSnippet}</code>
        </pre>
      </div>

      {/* Integration Architectural Guardrails */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
        <div className="p-5 bg-surface rounded-card border border-line shadow-2xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-fg">
            <Cpu className="w-4 h-4 text-accent" />
            <span>Zero SDK Vendor Lock-in</span>
          </div>
          <p className="text-xs text-fg-secondary leading-relaxed">
            Works directly with official `openai` Python and Node libraries, LangChain, LlamaIndex, and AutoGen.
          </p>
        </div>

        <div className="p-5 bg-surface rounded-card border border-line shadow-2xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-fg">
            <ShieldCheck className="w-4 h-4 text-success" />
            <span>Sub-5ms Atomic Check</span>
          </div>
          <p className="text-xs text-fg-secondary leading-relaxed">
            Redis executes atomic pre-flight Lua capacity reservations before forwarding traffic upstream.
          </p>
        </div>

        <div className="p-5 bg-surface rounded-card border border-line shadow-2xs space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-xs text-fg">
            <Code2 className="w-4 h-4 text-fg-secondary" />
            <span>Multi-Provider Fallbacks</span>
          </div>
          <p className="text-xs text-fg-secondary leading-relaxed">
            Switch between OpenAI, Claude, and Gemini by changing the model parameter without changing SDK code.
          </p>
        </div>
      </div>
    </div>
  );
}
