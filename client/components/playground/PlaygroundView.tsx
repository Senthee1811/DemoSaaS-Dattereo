'use client';

import React, { useState } from 'react';
import { 
  Play, 
  Terminal, 
  Cpu, 
  Layers, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  ShieldAlert, 
  ShieldCheck, 
  Copy, 
  Check, 
  Zap, 
  Lock,
  Code2
} from 'lucide-react';
import { authFetch } from '@/lib/auth-fetch';

interface PlaygroundViewProps {
  projects: Array<{ id: string; name: string }>;
  onRefreshMetrics: () => void;
}

const MODELS = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'OPENAI', inCost: 2.50, outCost: 10.00 },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o Mini', provider: 'OPENAI', inCost: 0.15, outCost: 0.60 },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'ANTHROPIC', inCost: 3.00, outCost: 15.00 },
  { id: 'gemini-1.5-pro', name: 'Google Gemini 1.5 Pro', provider: 'GEMINI', inCost: 1.25, outCost: 5.00 },
  { id: 'gemini-1.5-flash', name: 'Google Gemini 1.5 Flash', provider: 'GEMINI', inCost: 0.075, outCost: 0.30 },
];

export function PlaygroundView({ projects, onRefreshMetrics }: PlaygroundViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 'proj_copilot');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState('Generate a concise spend analysis summary for our Q3 multi-model AI infrastructure.');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1000);
  const [isLoading, setIsLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [codeTab, setCodeTab] = useState<'curl' | 'node' | 'python'>('curl');

  const selectedModelObj = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  const handleExecuteRequest = async () => {
    if (!prompt) return;
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
    } catch (err: any) {
      setExecutionResult({
        status: 500,
        data: { error: { message: err.message || 'Failed to connect to gateway' } }
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
        <h2 className="font-serif text-2xl font-normal text-[#141413] tracking-tight">
          Gateway Test Bench & Sandbox
        </h2>
        <p className="text-xs text-[#5F6368] mt-1">
          Send live inference requests to test upstream routing, latency, and atomic pre-flight budget reservations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Request Form (7 cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3.5 border-b border-[#E4E4E0]">
            <h3 className="font-serif text-lg font-normal text-[#141413] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#FF6B35]" />
              <span>Inference Request Config</span>
            </h3>

            {/* Scope Project */}
            <div className="flex items-center gap-2 text-xs text-[#5F6368]">
              <span>Project:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-[#FAF8F5] border border-[#E4E4E0] rounded-full px-3 py-1 text-xs text-[#141413] font-medium cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Model Selector with Pricing Cards */}
          <div>
            <label className="text-[11px] font-mono font-medium uppercase tracking-wider text-[#5F6368] block mb-2">
              Target Foundation Model
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedModel(m.id)}
                  className={`p-3 rounded-2xl text-left transition-colors border ${
                    selectedModel === m.id
                      ? 'bg-[#FFF7F2] border-[#FFD2C0] shadow-2xs'
                      : 'bg-white border-[#E4E4E0] hover:bg-[#FAF8F5]'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#141413] truncate">{m.name}</div>
                  <div className="text-[10px] font-mono text-[#5F6368] mt-1">
                    ${m.inCost.toFixed(2)} in / ${m.outCost.toFixed(2)} out
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Editor */}
          <div>
            <label className="text-[11px] font-mono font-medium uppercase tracking-wider text-[#5F6368] block mb-1.5">
              User Message (Prompt)
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-[#E4E4E0] font-mono text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35] leading-relaxed resize-none shadow-2xs"
              placeholder="Enter your inference prompt here..."
            />
          </div>

          {/* Hyperparameters */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-[#5F6368]">Temperature</span>
                <span className="font-mono tabular-nums text-[#141413]">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-[#FF6B35]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-[#5F6368]">Max Tokens</span>
                <span className="font-mono tabular-nums text-[#141413]">{maxTokens}</span>
              </div>
              <input
                type="range"
                min="256"
                max="4096"
                step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-[#FF6B35]"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExecuteRequest}
              disabled={isLoading || !prompt}
              className="w-full py-3 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs shadow-2xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isLoading ? 'Executing Atomic Reservation...' : 'Send Request via SpendGuard Gateway'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Telemetry & Results (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Response & Telemetry Panel */}
          <div className="bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E4E4E0]">
              <h3 className="font-serif text-lg font-normal text-[#141413]">Gateway Telemetry</h3>
              {executionResult && (
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
                  executionResult.status === 200
                    ? 'bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]'
                    : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                }`}>
                  HTTP {executionResult.status}
                </span>
              )}
            </div>

            {executionResult ? (
              <div className="space-y-3 text-xs">
                {/* Cost & Latency Metrics */}
                <div className="grid grid-cols-2 gap-2.5 bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#E4E4E0] font-mono tabular-nums">
                  <div>
                    <span className="text-[10px] text-[#5F6368] uppercase block">Incurred Cost</span>
                    <span className="text-sm font-bold text-[#0D9488]">
                      {executionResult.headers?.['x-spendguard-cost'] ? `$${executionResult.headers['x-spendguard-cost']}` : '$0.00000'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5F6368] uppercase block">Proxy Latency</span>
                    <span className="text-sm font-bold text-[#141413]">
                      {executionResult.headers?.['x-spendguard-latency'] || '0ms'}
                    </span>
                  </div>
                </div>

                {/* Completion Text */}
                <div>
                  <span className="text-[11px] font-mono font-medium text-[#5F6368] uppercase block mb-1.5">
                    Upstream Model Output
                  </span>
                  <div className="p-3.5 bg-[#FAF8F5] border border-[#E4E4E0] rounded-2xl font-mono text-xs text-[#141413] max-h-56 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                    {executionResult.data?.choices?.[0]?.message?.content || 
                     executionResult.data?.error?.message || 
                     JSON.stringify(executionResult.data, null, 2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[#80868B] space-y-2">
                <Code2 className="w-6 h-6 mx-auto text-[#80868B]" />
                <p>Click &quot;Send Request&quot; to test pre-flight budget reservations and live telemetry.</p>
              </div>
            )}
          </div>

          {/* Quick SDK / cURL Preview */}
          <div className="bg-white p-5 rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 p-0.5 rounded-full bg-[#FAF8F5] border border-[#E4E4E0]">
                {(['curl', 'node', 'python'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCodeTab(tab)}
                    className={`px-3 py-1 rounded-full text-[11px] font-mono transition-colors ${
                      codeTab === tab
                        ? 'bg-[#141413] text-white shadow-2xs font-semibold'
                        : 'text-[#5F6368] hover:text-[#141413]'
                    }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleCopySnippet}
                className="text-[11px] text-[#5F6368] hover:text-[#141413] flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-[#FAF8F5] transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-[#0D9488]" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <pre className="p-3.5 bg-[#141413] text-[#ECECE8] rounded-2xl font-mono text-[11px] overflow-x-auto leading-relaxed border border-white/10 shadow-2xs">
              <code>{getCodeSnippet()}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
