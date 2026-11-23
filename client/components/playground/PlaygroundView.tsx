'use client';

import React, { useState } from 'react';
import {
  Play,
  Terminal,
  Copy,
  Check,
  Code2,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';
import { ModelPicker } from './ModelPicker';
import { Badge } from '@/components/ui/Badge';
import { useScopeProject } from '@/lib/scope';

interface ExecutionResult {
  status: number;
  headers?: Record<'x-spendguard-cost' | 'x-spendguard-latency' | 'x-spendguard-blocked', string | null>;
  data?: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    [key: string]: unknown;
  };
}

interface PlaygroundViewProps {
  onRefreshMetrics: () => void;
}

export function PlaygroundView({ onRefreshMetrics }: PlaygroundViewProps) {
  // Global scope: requests go to the project in Scope (the first project while Scope is All projects)
  const { project: scopedProject, projectId: selectedProjectId, isFallback } = useScopeProject();
  // Empty until the catalog loads; ModelPicker reports the list and we default to its first entry
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('Generate a concise spend analysis summary for our Q3 multi-model AI infrastructure.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeTab, setCodeTab] = useState<'curl' | 'node' | 'python'>('curl');

  const handleExecuteRequest = async () => {
    if (!prompt || !selectedProjectId || !selectedModel) return;
    setIsLoading(true);
    setExecutionResult(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-spendguard-project-id': selectedProjectId,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          maxTokens
        })
      });

      const data = await res.json();
      setExecutionResult({
        status: res.status,
        headers: {
          'x-spendguard-cost': res.headers.get('x-spendguard-cost'),
          'x-spendguard-latency': res.headers.get('x-spendguard-latency'),
          'x-spendguard-blocked': res.headers.get('x-spendguard-blocked'),
        },
        data
      });
      onRefreshMetrics();
    } catch (err: unknown) {
      setExecutionResult({
        status: 500,
        data: { error: { message: errorMessage(err, 'Failed to connect to gateway') } }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getCodeSnippet = () => {
    if (codeTab === 'curl') {
      return `curl -X POST https://gateway.spendguard.ai/v1/chat/completions \\
  -H "Authorization: Bearer $SPENDGUARD_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "X-SpendGuard-Project-Id: ${selectedProjectId}" \\
  -d '{
    "model": "${selectedModel}",
    "messages": [{"role": "user", "content": "${prompt.slice(0, 40)}..."}],
    "temperature": ${temperature},
    "max_tokens": ${maxTokens}
  }'`;
    }
    if (codeTab === 'node') {
      return `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://gateway.spendguard.ai/v1',
  apiKey: process.env.SPENDGUARD_API_KEY,
  defaultHeaders: { 'X-SpendGuard-Project-Id': '${selectedProjectId}' }
});

const response = await client.chat.completions.create({
  model: '${selectedModel}',
  messages: [{ role: 'user', content: '${prompt.slice(0, 40)}...' }]
});`;
    }
    return `from openai import OpenAI

client = OpenAI(
    base_url="https://gateway.spendguard.ai/v1",
    api_key=os.environ.get("SPENDGUARD_API_KEY"),
    default_headers={"X-SpendGuard-Project-Id": "${selectedProjectId}"}
)

response = client.chat.completions.create(
    model="${selectedModel}",
    messages=[{"role": "user", "content": "${prompt.slice(0, 40)}..."}]
)`;
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(getCodeSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">
          Gateway Test Bench & Sandbox
        </h2>
        <p className="text-xs text-sg-text-secondary mt-1">
          Send live inference requests to test upstream routing, latency, and atomic pre-flight budget reservations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Request Form (7 cols) */}
        <div className="lg:col-span-7 bg-surface p-6 rounded-card border border-sg-border shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3.5 border-b border-sg-border">
            <h3 className="font-serif text-lg font-normal text-fg flex items-center gap-2">
              <Terminal className="w-4 h-4 text-accent" />
              <span>Inference Request Config</span>
            </h3>

            {/* The project comes from the global Scope: no separate picker that could drift from it */}
            <div className="flex items-center gap-2 text-xs text-sg-text-secondary" title={isFallback ? 'Scope is All projects, so the first project is used. Pick one in Scope to change it.' : 'Change it with Scope in the top bar'}>
              <span>Project:</span>
              <span className="px-3 py-1 rounded-full border border-line bg-surface-subtle text-fg font-medium max-w-[12rem] truncate">
                {scopedProject?.name ?? 'No project yet'}
              </span>
            </div>
          </div>

          {/* Model Selector with Pricing Cards */}
          <div>
            <label className="text-label font-mono font-medium uppercase tracking-wider text-sg-text-secondary block mb-2">
              Target Foundation Model
            </label>
            <ModelPicker
              selectedModel={selectedModel}
              onSelect={setSelectedModel}
              onLoaded={(models) => setSelectedModel((cur) => cur || models[0]?.model || '')}
            />
          </div>

          {/* Prompt Editor */}
          <div>
            <label className="text-label font-mono font-medium uppercase tracking-wider text-sg-text-secondary block mb-1.5">
              User Message (Prompt)
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-3.5 rounded-field border border-sg-border font-mono text-xs text-fg focus:outline-none focus:border-accent leading-relaxed resize-none shadow-2xs"
              placeholder="Enter your inference prompt here..."
            />
          </div>

          {/* Hyperparameters */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-sg-text-secondary">Temperature</span>
                <span className="font-mono tabular-nums text-fg">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-sg-text-secondary">Max Tokens</span>
                <span className="font-mono tabular-nums text-fg">{maxTokens}</span>
              </div>
              <input
                type="range"
                min="256"
                max="4096"
                step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExecuteRequest}
              disabled={isLoading || !prompt || !selectedProjectId || !selectedModel}
              className="w-full py-3 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs shadow-2xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isLoading ? 'Executing Atomic Reservation...' : 'Send Request via SpendGuard Gateway'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Telemetry & Results (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Response & Telemetry Panel */}
          <div className="bg-surface p-6 rounded-card border border-sg-border shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-sg-border">
              <h3 className="font-serif text-lg font-normal text-fg">Gateway Telemetry</h3>
              {executionResult && (
                <Badge tone={executionResult.status === 200 ? 'success' : 'critical'} mono>
                  {`HTTP ${executionResult.status}`}
                </Badge>
              )}
            </div>

            {executionResult ? (
              <div className="space-y-3 text-xs">
                {/* Cost & Latency Metrics */}
                <div className="grid grid-cols-2 gap-2.5 bg-parchment-ivory p-3.5 rounded-field border border-sg-border font-mono tabular-nums">
                  <div>
                    <span className="text-caption text-sg-text-secondary uppercase block">Incurred Cost</span>
                    <span className="text-sm font-bold text-success">
                      {executionResult.headers?.['x-spendguard-cost'] ? `$${executionResult.headers['x-spendguard-cost']}` : '$0.00000'}
                    </span>
                  </div>
                  <div>
                    <span className="text-caption text-sg-text-secondary uppercase block">Proxy Latency</span>
                    <span className="text-sm font-bold text-fg">
                      {executionResult.headers?.['x-spendguard-latency'] || '0ms'}
                    </span>
                  </div>
                </div>

                {/* Completion Text */}
                <div>
                  <span className="text-label font-mono font-medium text-sg-text-secondary uppercase block mb-1.5">
                    Upstream Model Output
                  </span>
                  <div className="p-3.5 bg-parchment-ivory border border-sg-border rounded-field font-mono text-xs text-fg max-h-56 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                    {executionResult.data?.choices?.[0]?.message?.content || 
                     executionResult.data?.error?.message || 
                     JSON.stringify(executionResult.data, null, 2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-sg-text-muted space-y-2">
                <Code2 className="w-6 h-6 mx-auto text-sg-text-muted" />
                <p>Click &quot;Send Request&quot; to test pre-flight budget reservations and live telemetry.</p>
              </div>
            )}
          </div>

          {/* Quick SDK / cURL Preview */}
          <div className="bg-surface p-5 rounded-card border border-sg-border shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 p-0.5 rounded-full bg-parchment-ivory border border-sg-border">
                {(['curl', 'node', 'python'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCodeTab(tab)}
                    className={`px-3 py-1 rounded-full text-label font-mono transition-colors ${
                      codeTab === tab
                        ? 'bg-inversion-dark text-white shadow-2xs font-semibold'
                        : 'text-sg-text-secondary hover:text-fg'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopySnippet}
                className="text-label text-sg-text-secondary hover:text-fg flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-parchment-ivory transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <pre className="p-3.5 bg-inversion-dark text-[#ECECE8] rounded-field font-mono text-label overflow-x-auto leading-relaxed border border-white/10 shadow-2xs">
              <code>{getCodeSnippet()}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
