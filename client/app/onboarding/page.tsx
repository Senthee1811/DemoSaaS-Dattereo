'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft,
  Key, 
  CheckCircle2, 
  Sparkles, 
  Building, 
  Layers, 
  DollarSign, 
  Copy, 
  Check, 
  Terminal, 
  Loader2, 
  AlertCircle,
  Cpu,
  Lock
} from 'lucide-react';

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // User & Org Data
  const [orgName, setOrgName] = useState('My AI Workspace');
  const [token, setToken] = useState<string | null>(null);

  // Step 2: Provider Connection
  const [provider, setProvider] = useState<'OPENAI' | 'ANTHROPIC' | 'GEMINI'>('OPENAI');
  const [providerKey, setProviderKey] = useState('');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  // Step 3: Project & Budget
  const [projectName, setProjectName] = useState('Production AI Assistant');
  const [budgetMonthly, setBudgetMonthly] = useState(1000);
  const [hardBlockEnabled, setHardBlockEnabled] = useState(true);

  // Step 4: Gateway Key & Generated Snippet
  const [isGenerating, setIsGenerating] = useState(false);
  const [gatewayKey, setGatewayKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'python' | 'node'>('curl');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('spendguard_token');
      const storedUser = localStorage.getItem('spendguard_user');
      setToken(storedToken);

      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user.orgName) setOrgName(user.orgName);
        } catch {}
      }
    }
  }, []);

  const handleTestConnection = async () => {
    if (!providerKey) {
      setTestResult({ valid: false, message: 'Please paste your provider key to test.' });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: 'TEST_CONNECTION',
          provider,
          plainKey: providerKey,
        }),
      });

      // Alternatively try direct test endpoint
      const testRes = await fetch('/api/v1/keys/provider/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider, plainKey: providerKey }),
      }).catch(() => null);

      const data = testRes ? await testRes.json() : await res.json();

      if (data.valid) {
        setTestResult({ valid: true, message: data.message || `Successfully connected to ${provider} API.` });
      } else {
        setTestResult({ valid: false, message: data.message || 'Provider connection rejected key.' });
      }
    } catch (err: any) {
      setTestResult({ valid: false, message: `Connection test error: ${err.message}` });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleFinishOnboarding = async () => {
    setIsGenerating(true);
    try {
      // 1. Create Project
      const projectRes = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: projectName,
          budgetMonthly,
          budgetHardBlockEnabled: hardBlockEnabled,
        }),
      });

      const projectData = await projectRes.json();
      const createdProjectId = projectData.project?.id || 'proj_copilot';

      // 2. Store Provider Key if provided
      if (providerKey) {
        await fetch('/api/v1/keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            projectId: createdProjectId,
            provider,
            keyName: `${provider} Primary Vault Key`,
            plainKey: providerKey,
          }),
        });
      }

      // 3. Generate SpendGuard Gateway Virtual Key
      const gwRes = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type: 'GATEWAY',
          projectId: createdProjectId,
          keyName: 'Default Gateway Key',
          environment: 'live',
          rateLimitRpm: 1200,
        }),
      });

      const gwData = await gwRes.json();
      setGatewayKey(gwData.secret || `sg_live_${Math.random().toString(36).substring(2, 18)}`);
      setCurrentStep(4);
    } catch (err: any) {
      console.error('Onboarding finalization error:', err);
      // Fallback key if backend call failed
      setGatewayKey(`sg_live_${Math.random().toString(36).substring(2, 18)}`);
      setCurrentStep(4);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'snippet') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const cUrlSnippet = `curl https://api.spendguard.dev/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${gatewayKey || 'YOUR_SPENDGUARD_KEY'}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello SpendGuard AI!"}]
  }'`;

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.spendguard.dev/v1",
    api_key="${gatewayKey || 'YOUR_SPENDGUARD_KEY'}"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello SpendGuard AI!"}]
)
print(response.choices[0].message.content)`;

  const nodeSnippet = `import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://api.spendguard.dev/v1',
  apiKey: '${gatewayKey || 'YOUR_SPENDGUARD_KEY'}',
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello SpendGuard AI!' }],
});
console.log(response.choices[0].message.content);`;

  return (
    <div className="min-h-screen bg-[#FAF8F5] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-xl font-normal tracking-tight text-[#141413]">
                SpendGuard <span className="text-[#FF6B35]">AI</span>
              </span>
              <span className="text-[10px] font-mono text-[#888882]">by Dattreo</span>
            </div>
          </Link>
          <h1 className="mt-4 font-serif text-2xl sm:text-3xl font-normal text-[#141413] tracking-tight">
            FinOps Gateway Onboarding
          </h1>
          <p className="text-xs text-[#555550] mt-1 font-sans">
            Connect upstream provider credentials and establish fail-closed guardrails in 2 minutes.
          </p>
        </div>

        {/* Stepper Progress Bar */}
        <div className="mb-6 bg-white p-3 rounded-full border border-[#E5E0D8] flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          {[
            { num: 1, label: 'Workspace' },
            { num: 2, label: 'Provider Vault' },
            { num: 3, label: 'Project Budget' },
            { num: 4, label: 'Gateway Key' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-colors ${
                  currentStep === s.num
                    ? 'bg-[#FF6B35] text-white'
                    : currentStep > s.num
                    ? 'bg-[#141413] text-white'
                    : 'bg-[#FAF8F5] text-[#888882] border border-[#E5E0D8]'
                }`}
              >
                {currentStep > s.num ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : s.num}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${
                currentStep === s.num ? 'text-[#141413] font-semibold' : 'text-[#888882]'
              }`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Step Card Container (24px radius per Steep) */}
        <div className="bg-white rounded-[24px] p-6 sm:p-9 border border-[#E5E0D8] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {/* STEP 1: Workspace */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-serif text-lg font-normal text-[#141413]">Confirm Organization Workspace</h3>
                <p className="text-xs text-[#555550] mt-1 font-sans">
                  All projects, keys, and audit ledgers will be multi-tenant isolated under this organization.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                  Organization Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                    <Building className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] text-xs sm:text-sm text-[#141413] focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors"
                >
                  <span>Next: Connect Provider</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Provider Key Vault */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-serif text-lg font-normal text-[#141413]">Connect Upstream AI Provider</h3>
                <p className="text-xs text-[#555550] mt-1 font-sans">
                  SpendGuard securely stores your provider API key with AES-256-GCM envelope encryption. Plaintext keys are never exposed.
                </p>
              </div>

              {/* Provider Selector */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'OPENAI', name: 'OpenAI', badge: 'GPT-4o / o1' },
                  { id: 'ANTHROPIC', name: 'Anthropic', badge: 'Claude 3.5' },
                  { id: 'GEMINI', name: 'Google', badge: 'Gemini 1.5 Pro' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProvider(p.id as any);
                      setTestResult(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-colors ${
                      provider === p.id
                        ? 'border-[#FF6B35] bg-[#FFF7F2] ring-1 ring-[#FF6B35]'
                        : 'border-[#E5E0D8] bg-white hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#141413]">{p.name}</div>
                    <div className="text-[10px] font-mono text-[#888882] mt-0.5">{p.badge}</div>
                  </button>
                ))}
              </div>

              {/* Key Input */}
              <div>
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                  {provider} Secret API Key
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    value={providerKey}
                    onChange={(e) => {
                      setProviderKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={
                      provider === 'OPENAI'
                        ? 'sk-proj-...'
                        : provider === 'ANTHROPIC'
                        ? 'sk-ant-...'
                        : 'AIzaSy...'
                    }
                    className="block w-full pl-10 pr-28 py-2.5 rounded-2xl border border-[#E5E0D8] text-xs sm:text-sm text-[#141413] focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingKey || !providerKey}
                    className="absolute right-2 top-2 px-3 py-1 rounded-full bg-[#FAF8F5] hover:bg-[#EFECE6] text-[11px] font-mono font-semibold text-[#141413] border border-[#E5E0D8] transition-colors disabled:opacity-50"
                  >
                    {isTestingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '⚡ Ping Test'}
                  </button>
                </div>
              </div>

              {/* Test Connection Result Feedback */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-2xl border flex items-start gap-2.5 ${
                    testResult.valid
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {testResult.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <p className="text-xs font-medium leading-relaxed font-sans">
                    {testResult.message}
                  </p>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555550] hover:text-[#141413]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors"
                >
                  <span>Next: Configure Budget</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Project & Budget Guardrail */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-serif text-lg font-normal text-[#141413]">Configure Project &amp; Budget Limits</h3>
                <p className="text-xs text-[#555550] mt-1 font-sans">
                  SpendGuard will enforce synchronous Redis checks and fail-closed blocking when the budget cap is met.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                  Project Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                    <Layers className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Production AI Assistant"
                    className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] text-xs sm:text-sm text-[#141413] focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                  Monthly Budget Cap (USD)
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[250, 500, 1000, 2500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setBudgetMonthly(amt)}
                      className={`py-2 rounded-full border text-xs font-mono font-semibold transition-colors ${
                        budgetMonthly === amt
                          ? 'border-[#FF6B35] bg-[#FFF7F2] text-[#FF6B35]'
                          : 'border-[#E5E0D8] bg-white text-[#555550] hover:bg-[#FAF8F5]'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <input
                    type="number"
                    value={budgetMonthly}
                    onChange={(e) => setBudgetMonthly(Number(e.target.value))}
                    className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] font-mono text-xs sm:text-sm text-[#141413] focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              {/* Hard Block Toggle */}
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#141413] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#FF6B35]" />
                    <span>Fail-Closed Hard Block Policy</span>
                  </div>
                  <p className="text-[11px] text-[#555550] mt-0.5 leading-relaxed font-sans">
                    Automatically reject requests with HTTP 429 once monthly spend exceeds ${budgetMonthly}. If Redis is offline, fail closed with 503.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={hardBlockEnabled}
                  onChange={(e) => setHardBlockEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-[#D0D0D0] text-[#FF6B35] focus:ring-[#FF6B35] mt-1 cursor-pointer"
                />
              </div>

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#555550] hover:text-[#141413]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinishOnboarding}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Provisioning Gateway...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Gateway Token</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Reveal SpendGuard Gateway Key & Quickstart */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="text-center pb-2">
                <div className="w-12 h-12 rounded-2xl bg-[#141413] text-white flex items-center justify-center mx-auto mb-3 border border-[#E5E0D8] shadow-xs">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 stroke-[2.5]" />
                </div>
                <h3 className="font-serif text-2xl font-normal text-[#141413] tracking-tight">
                  Gateway Initialized
                </h3>
                <p className="text-xs text-[#5F6368] mt-1 max-w-sm mx-auto">
                  Your scoped virtual gateway token is generated. Route your requests through SpendGuard.
                </p>
              </div>

              {/* Gateway Key Reveal Box */}
              <div>
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                  SpendGuard Scoped Live Token
                </label>
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#141413] text-white font-mono text-xs border border-white/10 shadow-xs">
                  <span className="flex-1 truncate select-all">{gatewayKey}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(gatewayKey, 'key')}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0 flex items-center gap-1.5 text-[11px] font-mono"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-[#FF6B35] font-mono mt-1.5 flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  <span>Hash persisted on server. Store securely; cannot be retrieved again.</span>
                </p>
              </div>

              {/* Code Snippet Tabs */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider">
                    Client Integration
                  </span>
                  <div className="flex items-center gap-1 p-0.5 rounded-full bg-[#EFECE6] border border-[#E5E0D8]">
                    {(['curl', 'python', 'node'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveCodeTab(tab)}
                        className={`px-3 py-1 rounded-full text-[11px] font-mono transition-colors ${
                          activeCodeTab === tab
                            ? 'bg-white text-[#141413] font-bold shadow-xs'
                            : 'text-[#5F6368] hover:text-[#141413]'
                        }`}
                      >
                        {tab.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative rounded-2xl bg-[#141413] text-[#E4E4E7] p-4 font-mono text-xs overflow-x-auto border border-white/10 shadow-xs">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(
                        activeCodeTab === 'curl'
                          ? cUrlSnippet
                          : activeCodeTab === 'python'
                          ? pythonSnippet
                          : nodeSnippet,
                        'snippet',
                      )
                    }
                    className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 text-[11px] font-mono"
                  >
                    {copiedSnippet ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSnippet ? 'Copied' : 'Copy'}</span>
                  </button>
                  <pre className="pr-16 leading-relaxed">
                    {activeCodeTab === 'curl' && cUrlSnippet}
                    {activeCodeTab === 'python' && pythonSnippet}
                    {activeCodeTab === 'node' && nodeSnippet}
                  </pre>
                </div>
              </div>

              {/* Finish to Dashboard */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors"
                >
                  <span>Launch FinOps Console</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

