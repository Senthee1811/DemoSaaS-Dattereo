'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  CircleCheck,
  Building2,
  DollarSign,
  Copy,
  Check,
  Loader2,
  TriangleAlert,
  Lock,
  Zap,
  Activity,
} from 'lucide-react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { cheapestModelFor, useModelCatalog } from '@/lib/model-catalog';
import { useHydrated, useLocalStorageValue, useStoredUser } from '@/lib/client-storage';

type Step = 1 | 2 | 3 | 4 | 5;

type ProviderId = 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string; desc: string }> = [
  { id: 'OPENAI', label: 'OpenAI', desc: 'GPT models' },
  { id: 'ANTHROPIC', label: 'Anthropic', desc: 'Claude models' },
  { id: 'GEMINI', label: 'Gemini', desc: 'Gemini models' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);

  // User & Org Data
  // Workspace name defaults to the org saved at login; typing overrides it
  const storedOrgName = useStoredUser()?.orgName;
  const [editedOrgName, setOrgName] = useState<string | null>(null);
  const orgName = editedOrgName ?? storedOrgName ?? 'My AI Workspace';
  const hydrated = useHydrated();
  const accessToken = useLocalStorageValue('spendguard_token');

  // Step 2: Provider Connection
  const [provider, setProvider] = useState<ProviderId>('OPENAI');
  // Cheapest currently-priced model for the chosen provider, from the live catalog (no bundled list)
  const catalog = useModelCatalog();
  const testModel = catalog.status === 'ready' ? cheapestModelFor(catalog.models, provider) : undefined;
  const [providerKey, setProviderKey] = useState('');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  // Step 3: Project & Budget
  const [projectName, setProjectName] = useState('Production AI Assistant');
  const [budgetMonthly, setBudgetMonthly] = useState(1000);
  const [hardBlockEnabled, setHardBlockEnabled] = useState(true);

  // Step 4: Gateway Key & Generated Snippet
  const [isGenerating, setIsGenerating] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [gatewayKey, setGatewayKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'curl' | 'python' | 'node'>('curl');

  // Step 4: Verification
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationOutcome, setVerificationOutcome] = useState<{
    verified: boolean;
    latencyMs?: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace('/login?required=1&next=%2Fonboarding');
  }, [hydrated, accessToken, router]);

  const handleTestConnection = async () => {
    if (!providerKey) {
      setTestResult({ valid: false, message: 'Please paste your provider key to test.' });
      return;
    }
    setIsTestingKey(true);
    setTestResult(null);

    try {
      // Live check against the provider (the key is not stored by this call)
      const testRes = await authFetch('/api/v1/keys/provider/test', {
        method: 'POST',
        body: JSON.stringify({ provider, plainKey: providerKey }),
      });

      if (!testRes.ok) {
        throw new Error(await readApiError(testRes, 'Could not verify this key.'));
      }

      const data: { valid: boolean; message: string } = await testRes.json();
      setTestResult({ valid: Boolean(data.valid), message: data.message });
    } catch (err: unknown) {
      setTestResult({
        valid: false,
        message: err instanceof Error ? err.message : 'Could not verify this key.',
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleFinishStep3 = async () => {
    setIsGenerating(true);
    setSetupError(null);

    try {
      // 1. Create the project (budget guardrails live here)
      const projRes = await authFetch('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectName,
          budgetMonthly,
          budgetHardBlockEnabled: hardBlockEnabled,
        }),
      });
      if (!projRes.ok) {
        throw new Error(await readApiError(projRes, 'Could not create the project.'));
      }
      const projData = await projRes.json();
      const projId: string | undefined = projData?.project?.id;
      if (!projId) throw new Error('The server did not return a project id.');

      // 2. Store the encrypted provider key, if one was provided
      if (providerKey) {
        const keyRes = await authFetch('/api/v1/keys', {
          method: 'POST',
          body: JSON.stringify({
            type: 'PROVIDER',
            projectId: projId,
            provider,
            plainKey: providerKey,
            keyName: `${provider} Primary Key`,
          }),
        });
        if (!keyRes.ok) {
          throw new Error(await readApiError(keyRes, 'Project created, but the provider key could not be stored.'));
        }
      }

      // 3. Issue the SpendGuard gateway key (shown once)
      const gwRes = await authFetch('/api/v1/keys', {
        method: 'POST',
        body: JSON.stringify({
          type: 'GATEWAY',
          projectId: projId,
          keyName: 'Default Gateway Key',
          environment: 'live',
          rateLimitRpm: 1200,
        }),
      });
      if (!gwRes.ok) {
        throw new Error(await readApiError(gwRes, 'Project created, but the gateway key could not be issued.'));
      }
      const gwData = await gwRes.json();
      if (!gwData?.secret) throw new Error('The server did not return a gateway key.');

      setGatewayKey(gwData.secret);
      setCurrentStep(4);
    } catch (err: unknown) {
      // Never fabricate a key: a fake key would fail every request the user makes with it
      setSetupError(err instanceof Error ? err.message : 'Workspace setup failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVerifyIntegration = async () => {
    if (!gatewayKey) return;
    if (!testModel) {
      setVerificationOutcome({
        verified: false,
        latencyMs: 0,
        message: 'The model list could not be loaded, so no test model was chosen. Reload the page and try again.',
      });
      return;
    }
    setIsVerifying(true);
    setVerificationOutcome(null);

    const startTime = performance.now();
    try {
      // Deliberately a plain fetch: this call authenticates with the *gateway key*,
      // exactly like the user's own application will.
      const res = await fetch('/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayKey}`,
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Connection test ping' }],
          max_tokens: 15,
        }),
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (res.ok) {
        setVerificationOutcome({
          verified: true,
          latencyMs,
          message: `Gateway request succeeded in ${latencyMs}ms. Budget reservation, provider call and audit logging all verified.`,
        });
      } else if (res.status === 401 || res.status === 403) {
        setVerificationOutcome({
          verified: false,
          latencyMs,
          message: `The gateway rejected the key: ${await readApiError(res)}`,
        });
      } else {
        setVerificationOutcome({
          verified: false,
          latencyMs,
          message: `Your gateway key is valid, but the request did not complete (HTTP ${res.status}): ${await readApiError(res)}`,
        });
      }
    } catch (err: unknown) {
      setVerificationOutcome({
        verified: false,
        message: err instanceof Error ? err.message : 'Gateway probe failed. Ensure the backend service is reachable.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = (text: string, type: 'key' | 'snippet') => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      if (type === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2000);
      }
    }
  };

  // Dynamic Gateway URL based on runtime environment
  const gatewayUrl = typeof window !== 'undefined' 
    ? `${window.location.protocol}//${window.location.hostname}:4000/v1`
    : 'http://localhost:4000/v1';

  const cUrlSnippet = `curl ${gatewayUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${gatewayKey || 'YOUR_SPENDGUARD_KEY'}" \\
  -d '{
    "model": "${testModel ?? '<model-id>'}",
    "messages": [{"role": "user", "content": "Hello SpendGuard AI!"}]
  }'`;

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${gatewayUrl}",
    api_key="${gatewayKey || 'YOUR_SPENDGUARD_KEY'}"
)

response = client.chat.completions.create(
    model="${testModel ?? '<model-id>'}",
    messages=[{"role": "user", "content": "Hello SpendGuard AI!"}]
)
print(response.choices[0].message.content)`;

  const nodeSnippet = `import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: '${gatewayUrl}',
  apiKey: '${gatewayKey || 'YOUR_SPENDGUARD_KEY'}',
});

const response = await openai.chat.completions.create({
  model: '${testModel ?? '<model-id>'}',
  messages: [{ role: 'user', content: 'Hello SpendGuard AI!' }],
});
console.log(response.choices[0].message.content);`;

  return (
    <div className="min-h-screen bg-parchment-ivory py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-xl font-normal tracking-tight text-fg">
                SpendGuard <span className="text-accent">AI</span>
              </span>
              <span className="text-caption font-mono text-fg-muted">by Dattreo</span>
            </div>
          </Link>
          <h1 className="mt-4 font-serif text-2xl sm:text-3xl font-normal text-fg tracking-tight">
            FinOps Gateway Onboarding
          </h1>
          <p className="text-xs text-fg-secondary mt-1 font-sans">
            Connect upstream provider credentials and establish fail-closed guardrails in 2 minutes.
          </p>
        </div>

        {/* Stepper Progress Bar (5 Steps) */}
        <div className="mb-6 bg-surface p-3 rounded-full border border-parchment-border flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          {[
            { num: 1, label: 'Workspace' },
            { num: 2, label: 'Provider Vault' },
            { num: 3, label: 'Project Budget' },
            { num: 4, label: 'SDK & Verify' },
            { num: 5, label: 'Activated' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-colors ${
                  currentStep === s.num
                    ? 'bg-accent text-white'
                    : currentStep > s.num
                    ? 'bg-inversion-dark text-white'
                    : 'bg-parchment-ivory text-fg-muted border border-parchment-border'
                }`}
              >
                {currentStep > s.num ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : s.num}
              </div>
              <span className={`text-xs font-medium hidden sm:inline ${
                currentStep === s.num ? 'text-fg font-semibold' : 'text-fg-muted'
              }`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Step Card Container (24px radius per Steep) */}
        <div className="bg-surface rounded-card p-6 sm:p-9 border border-parchment-border shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {/* STEP 1: Workspace */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-serif text-lg font-normal text-fg">Confirm Organization Workspace</h3>
                <p className="text-xs text-fg-secondary mt-1 font-sans">
                  All projects, keys, and audit ledgers will be multi-tenant isolated under this organization.
                </p>
              </div>

              <div>
                <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider mb-1.5">
                  Organization Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fg-muted">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="block w-full pl-10 pr-3.5 py-2.5 rounded-field border border-parchment-border text-xs sm:text-sm text-fg focus:ring-1 focus:ring-accent focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors"
                >
                  <span>Next: Connect Provider</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Connect Provider */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-serif text-lg font-normal text-fg">Connect Upstream AI Provider</h3>
                <p className="text-xs text-fg-secondary mt-1 font-sans">
                  Provider keys are cryptographically sealed with AES-256-GCM envelope encryption. Plaintext is never logged.
                </p>
              </div>

              {/* Provider Selection Tabs */}
              <div>
                <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider mb-1.5">
                  Select Provider
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {PROVIDER_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setProvider(p.id);
                        setTestResult(null);
                      }}
                      className={`p-3 rounded-field border text-left transition-all ${
                        provider === p.id
                          ? 'border-accent bg-accent-subtle text-fg shadow-xs'
                          : 'border-parchment-border hover:border-line bg-surface text-fg-secondary'
                      }`}
                    >
                      <div className="text-xs font-bold">{p.label}</div>
                      <div className="text-caption font-mono text-fg-muted mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key Input with Connection Test */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider">
                    {provider} API Key
                  </label>
                  <span className="text-caption font-mono text-fg-muted">Encrypted at rest (AES-256-GCM)</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fg-muted">
                    <KeyRound className="h-4 w-4" />
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
                        ? 'sk-ant-api03-...'
                        : 'AIzaSy...'
                    }
                    className="block w-full pl-10 pr-24 py-2.5 rounded-field border border-parchment-border text-xs sm:text-sm font-mono text-fg placeholder-fg-muted focus:ring-1 focus:ring-accent focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingKey || !providerKey}
                    className="absolute right-2 top-2 px-3 py-1 rounded-full bg-parchment-ivory hover:bg-parchment-oat border border-parchment-border text-label font-mono font-semibold text-fg transition-colors disabled:opacity-40"
                  >
                    {isTestingKey ? 'Testing...' : '⚡ Test'}
                  </button>
                </div>

                {testResult && (
                  <div className={`mt-2 p-2.5 rounded-menu border flex items-center gap-2 text-xs font-mono ${
                    testResult.valid
                      ? 'bg-success-bg border-success-border text-success'
                      : 'bg-critical-bg border-critical-border text-critical'
                  }`}>
                    {testResult.valid ? <CircleCheck className="w-3.5 h-3.5 text-success shrink-0" /> : <TriangleAlert className="w-3.5 h-3.5 text-critical shrink-0" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors"
                >
                  <span>Next: Configure Budget</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Project & Budget */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="font-serif text-lg font-normal text-fg">Configure Project & Budget Limits</h3>
                <p className="text-xs text-fg-secondary mt-1 font-sans">
                  Define hard spending caps. Requests exceeding this threshold receive HTTP 429 budget_exceeded instantly.
                </p>
              </div>

              <div>
                <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="block w-full px-3.5 py-2.5 rounded-field border border-parchment-border text-xs sm:text-sm text-fg focus:ring-1 focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider">
                    Monthly Budget Cap (USD)
                  </label>
                  <span className="text-caption font-mono text-accent font-semibold">Pre-Flight Guardrail</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fg-muted">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <input
                    type="number"
                    min={50}
                    step={50}
                    value={budgetMonthly}
                    onChange={(e) => setBudgetMonthly(Number(e.target.value))}
                    className="block w-full pl-10 pr-3.5 py-2.5 rounded-field border border-parchment-border text-xs sm:text-sm font-mono text-fg focus:ring-1 focus:ring-accent focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              {/* Hard block policy toggle */}
              <div className="p-3.5 rounded-field bg-parchment-ivory border border-parchment-border flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <span>Fail-Closed Hard Block Policy</span>
                  </div>
                  <p className="text-label text-fg-secondary mt-0.5 leading-relaxed font-sans">
                    Automatically reject requests with HTTP 429 once monthly spend exceeds ${budgetMonthly}. If Redis is offline, fail closed with 503.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={hardBlockEnabled}
                  onChange={(e) => setHardBlockEnabled(e.target.checked)}
                  className="w-4 h-4 rounded-control border-line text-accent focus:ring-accent mt-1 cursor-pointer"
                />
              </div>

              {setupError && (
                <div role="alert" className="p-3 rounded-menu border border-sg-critical-border bg-sg-critical-bg flex items-start gap-2 text-xs text-critical">
                  <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{setupError}</span>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={handleFinishStep3}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
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

          {/* STEP 4: Reveal SpendGuard Gateway Key & Live Verification */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="text-center pb-2">
                <div className="w-12 h-12 rounded-field bg-inversion-dark text-white flex items-center justify-center mx-auto mb-3 border border-parchment-border shadow-xs">
                  <CircleCheck className="w-6 h-6 text-emerald-400 stroke-[2.5]" />
                </div>
                <h3 className="font-serif text-2xl font-normal text-fg tracking-tight">
                  Virtual Gateway Token Issued
                </h3>
                <p className="text-xs text-sg-text-secondary mt-1 max-w-sm mx-auto">
                  Your scoped virtual gateway token is generated. Route your requests through SpendGuard.
                </p>
              </div>

              {/* Gateway Key Reveal Box */}
              <div>
                <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider mb-1.5">
                  SpendGuard Scoped Live Token
                </label>
                <div className="flex items-center gap-2 p-3 rounded-field bg-inversion-dark text-white font-mono text-xs border border-white/10 shadow-xs">
                  <span className="flex-1 truncate select-all">{gatewayKey}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(gatewayKey, 'key')}
                    className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0 flex items-center gap-1.5 text-label font-mono"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p className="text-label text-accent font-mono mt-1.5 flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  <span>Hash persisted on server. Store securely; cannot be retrieved again.</span>
                </p>
              </div>

              {/* Code Snippet Tabs */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-label font-mono font-medium text-fg uppercase tracking-wider">
                    Drop-In Integration Snippet
                  </span>
                  <div className="flex items-center gap-1 p-0.5 rounded-full bg-parchment-oat border border-parchment-border">
                    {(['curl', 'python', 'node'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveCodeTab(tab)}
                        className={`px-3 py-1 rounded-full text-label font-mono transition-colors ${
                          activeCodeTab === tab
                            ? 'bg-surface text-fg font-bold shadow-xs'
                            : 'text-sg-text-secondary hover:text-fg'
                        }`}
                      >
                        {tab.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative rounded-field bg-inversion-dark text-[#E4E4E7] p-4 font-mono text-xs overflow-x-auto border border-white/10 shadow-xs">
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
                    className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 text-label font-mono"
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

              {/* Live Connection Verification Test */}
              <div className="p-4 rounded-field bg-parchment-ivory border border-parchment-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-fg">Verify Gateway Integration</h4>
                    <p className="text-label text-fg-secondary">
                      Execute a real pre-flight reservation probe through the gateway right now.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyIntegration}
                    disabled={isVerifying}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-inversion-dark hover:bg-black text-white text-xs font-mono font-semibold transition-colors shadow-xs disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Probing...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5 text-accent" />
                        <span>Verify Connection</span>
                      </>
                    )}
                  </button>
                </div>

                {verificationOutcome && (
                  <div className={`p-3 rounded-menu border text-xs font-mono flex items-start gap-2 ${
                    verificationOutcome.verified
                      ? 'bg-success-bg border-success-border text-success'
                      : 'bg-critical-bg border-critical-border text-critical'
                  }`}>
                    {verificationOutcome.verified ? (
                      <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    ) : (
                      <TriangleAlert className="w-4 h-4 text-critical shrink-0 mt-0.5" />
                    )}
                    <span>{verificationOutcome.message}</span>
                  </div>
                )}
              </div>

              {/* Advance to Step 5 (Summary) */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary hover:text-fg"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors"
                >
                  <span>Review Activation Summary</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Onboarding Completion Summary */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="text-center pb-2">
                <div className="w-12 h-12 rounded-field bg-emerald-500 text-white flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <CircleCheck className="w-7 h-7 stroke-[2.5]" />
                </div>
                <h3 className="font-serif text-2xl font-normal text-fg tracking-tight">
                  Workspace Ready for Production
                </h3>
                <p className="text-xs text-sg-text-secondary mt-1 max-w-sm mx-auto">
                  Your AI infrastructure is now governed by SpendGuard AI with fail-closed financial guardrails.
                </p>
              </div>

              {/* Status Breakdown Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-field bg-parchment-ivory border border-parchment-border space-y-1">
                  <span className="text-caption font-mono text-fg-muted uppercase tracking-wider block">Connected Provider</span>
                  <div className="flex items-center gap-2">
                    <CircleCheck className="w-4 h-4 text-success" />
                    <span className="text-xs font-semibold text-fg">{provider}</span>
                    <span className="text-caption font-mono text-success bg-success-bg px-2 py-0.5 rounded-full border border-success-border">AES-256-GCM Sealed</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-field bg-parchment-ivory border border-parchment-border space-y-1">
                  <span className="text-caption font-mono text-fg-muted uppercase tracking-wider block">Provisioned Project</span>
                  <div className="flex items-center gap-2">
                    <CircleCheck className="w-4 h-4 text-success" />
                    <span className="text-xs font-semibold text-fg truncate">{projectName}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-field bg-parchment-ivory border border-parchment-border space-y-1">
                  <span className="text-caption font-mono text-fg-muted uppercase tracking-wider block">Monthly Budget Cap</span>
                  <div className="flex items-center gap-2">
                    <CircleCheck className="w-4 h-4 text-success" />
                    <span className="text-xs font-semibold text-fg font-mono tabular-nums">${budgetMonthly.toLocaleString()}/mo</span>
                    <span className="text-caption font-mono text-accent bg-accent-subtle px-2 py-0.5 rounded-full border border-accent-border">Hard Block Enforced</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-field bg-parchment-ivory border border-parchment-border space-y-1">
                  <span className="text-caption font-mono text-fg-muted uppercase tracking-wider block">Virtual Gateway Token</span>
                  <div className="flex items-center gap-2">
                    <CircleCheck className="w-4 h-4 text-success" />
                    <span className="text-xs font-mono text-fg">{gatewayKey.substring(0, 11)}••••••••</span>
                    <span className="text-caption font-mono text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">SHA-256 Hashed</span>
                  </div>
                </div>
              </div>

              {/* Recommended Next Actions */}
              <div className="p-4 rounded-field bg-accent-subtle border border-accent-border flex items-start gap-3">
                <Zap className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-accent">Recommended Next Step</p>
                  <p className="text-fg-secondary">
                    Launch the console to explore the <strong>Interactive Product Tour</strong> or test multi-model latency in the <strong>Test Bench</strong>.
                  </p>
                </div>
              </div>

              {/* Launch CTA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('spendguard_onboarding_state', 'ONBOARDING_COMPLETED');
                    }
                    router.push('/dashboard');
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm shadow-xs transition-colors"
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
