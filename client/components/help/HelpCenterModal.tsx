'use client';

import React, { useState } from 'react';
import { 
  X, 
  CircleHelp, 
  BookOpen, 
  Compass, 
  ShieldCheck, 
  Network, 
  KeyRound, 
  DollarSign, 
  TriangleAlert, 
  CreditCard, 
  Search,
  ExternalLink,
  CircleCheck,
  Lock,
  ChevronRight
} from 'lucide-react';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestartTour: () => void;
  onNavigateToSdk: () => void;
}

type HelpCategory = 
  | 'getting-started'
  | 'gateway'
  | 'python-sdk'
  | 'node-sdk'
  | 'provider-config'
  | 'budget-enforcement'
  | 'key-security'
  | 'billing'
  | 'troubleshooting';

export function HelpCenterModal({
  isOpen,
  onClose,
  onRestartTour,
  onNavigateToSdk,
}: HelpCenterModalProps) {
  const [activeCategory, setActiveCategory] = useState<HelpCategory>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const categories = [
    { id: 'getting-started' as HelpCategory, label: 'Getting Started', icon: BookOpen },
    { id: 'gateway' as HelpCategory, label: 'AI Gateway Architecture', icon: Network },
    { id: 'python-sdk' as HelpCategory, label: 'Python SDK Integration', icon: Network },
    { id: 'node-sdk' as HelpCategory, label: 'Node.js SDK Integration', icon: Network },
    { id: 'provider-config' as HelpCategory, label: 'Provider Vault Setup', icon: KeyRound },
    { id: 'budget-enforcement' as HelpCategory, label: 'Budget Caps & Hard-Blocks', icon: DollarSign },
    { id: 'key-security' as HelpCategory, label: 'AES-256-GCM Encryption', icon: Lock },
    { id: 'billing' as HelpCategory, label: 'Plans & Stripe Billing', icon: CreditCard },
    { id: 'troubleshooting' as HelpCategory, label: 'Troubleshooting FAQ', icon: TriangleAlert },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[85vh] bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xl flex flex-col overflow-hidden font-sans"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-[#E4E4E0] flex items-center justify-between shrink-0 bg-[#FAF8F5]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#FF6B35] text-white flex items-center justify-center shadow-xs">
              <CircleHelp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="help-title" className="font-serif text-lg font-normal text-[#141413] tracking-tight">
                  SpendGuard FinOps Knowledge Base
                </h2>
                <span className="text-[10px] font-mono text-[#888882]">v2.0 • Dattreo Studio</span>
              </div>
              <p className="text-xs text-[#555550]">
                Official developer documentation, gateway reference, and operational troubleshooting.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onRestartTour();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-[#F3F3F0] border border-[#E5E0D8] text-xs font-semibold text-[#141413] transition-colors shadow-2xs"
            >
              <Compass className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>Restart Tour</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-[#888882] hover:text-[#141413] hover:bg-[#F3F3F0] transition-colors"
              aria-label="Close help modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Category Sidebar */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#E4E4E0] p-3 space-y-1 overflow-y-auto shrink-0 bg-[#FBFBFA]">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-full text-xs transition-colors ${
                    isActive
                      ? 'bg-[#FFF7F2] text-[#FF6B35] font-semibold border border-[#FFD2C0]'
                      : 'text-[#555550] hover:bg-[#F3F3F0] hover:text-[#141413] font-medium'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#FF6B35]' : 'text-[#888882]'}`} />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  <ChevronRight className={`w-3 h-3 ${isActive ? 'text-[#FF6B35]' : 'text-[#C4BFB8]'}`} />
                </button>
              );
            })}
          </div>

          {/* Right Topic Details */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {activeCategory === 'getting-started' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Getting Started with SpendGuard AI</h3>
                  <p className="text-xs text-[#555550]">Four foundational concepts for setting up AI FinOps governance.</p>
                </div>

                <div className="space-y-3 text-xs text-[#555550] leading-relaxed">
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1">
                    <p className="font-semibold text-[#141413]">1. AES-256-GCM Provider Key Storage</p>
                    <p>Enter your upstream OpenAI, Anthropic, or Gemini keys in the Key Vault. SpendGuard encrypts them with AES-256-GCM using initialization vectors and authenticated tags. Plaintext keys never touch logs or databases.</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1">
                    <p className="font-semibold text-[#141413]">2. Scoped Virtual Gateway Tokens</p>
                    <p>Applications authenticate with virtual tokens (<code className="font-mono text-[#FF6B35]">sg_live_*</code>). The gateway validates the token hash, confirms project limits in Redis, and forwards requests using the decrypted upstream credential.</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1">
                    <p className="font-semibold text-[#141413]">3. Sub-5ms Atomic Pre-Flight Capacity Reservation</p>
                    <p>Before forwarding an inference call, the gateway executes an atomic Redis Lua script to reserve maximum estimated token capacity. If the project balance is depleted, it fails closed immediately with HTTP 429.</p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-1">
                    <p className="font-semibold text-[#141413]">4. Post-Flight Reconciliation & Settlement</p>
                    <p>Once the LLM finishes, the gateway computes the exact dollar amount from returned token counts, refunds unused reservation margins to Redis, and writes an immutable cryptographic record to the audit ledger.</p>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'gateway' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">AI Gateway Architecture</h3>
                  <p className="text-xs text-[#555550]">High-throughput reverse proxy with zero prompt retention.</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#141413] text-zinc-300 font-mono text-xs space-y-2 border border-white/10">
                  <p className="text-white font-bold">Standard Route:</p>
                  <code className="text-[#FF6B35] block">POST /v1/chat/completions</code>
                  <p className="text-zinc-400">Header: <code className="text-zinc-200">Authorization: Bearer sg_live_...</code></p>
                  <p className="text-zinc-400">Payload: Standard OpenAI-compatible schema (model, messages, temperature, max_tokens).</p>
                </div>
                <div className="text-xs text-[#555550] space-y-2">
                  <p className="font-semibold text-[#141413]">Governance Response Headers:</p>
                  <ul className="list-disc pl-5 space-y-1 font-mono text-[11px]">
                    <li><strong className="text-[#141413]">x-spendguard-cost:</strong> Exact USD billed for the request ($0.00750)</li>
                    <li><strong className="text-[#141413]">x-spendguard-latency:</strong> Upstream + proxy duration in milliseconds</li>
                    <li><strong className="text-[#141413]">x-spendguard-tokens:</strong> Combined input + output token count</li>
                    <li><strong className="text-[#141413]">x-request-id:</strong> Cryptographic audit trace identifier</li>
                  </ul>
                </div>
              </div>
            )}

            {activeCategory === 'python-sdk' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Python SDK Integration</h3>
                  <p className="text-xs text-[#555550]">Drop-in compatibility with the official OpenAI Python library.</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#141413] text-zinc-300 font-mono text-xs overflow-x-auto border border-white/10">
                  <pre className="text-[11px] leading-relaxed">
{`from openai import OpenAI

# Simply configure baseURL to SpendGuard Gateway
client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="sg_live_your_virtual_token"
)

response = client.chat.completions.create(
    model="gpt-4o", # or "claude-3-5-sonnet", "gemini-1.5-pro"
    messages=[{"role": "user", "content": "Analyze quarterly FinOps ledger"}]
)

print(response.choices[0].message.content)`}
                  </pre>
                </div>
              </div>
            )}

            {activeCategory === 'node-sdk' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Node.js & TypeScript SDK</h3>
                  <p className="text-xs text-[#555550]">Zero-rewrite drop-in for Node.js, Next.js, and Express apps.</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#141413] text-zinc-300 font-mono text-xs overflow-x-auto border border-white/10">
                  <pre className="text-[11px] leading-relaxed">
{`import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:4000/v1',
  apiKey: process.env.SPENDGUARD_API_KEY, // sg_live_*
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Execute model audit' }],
});

console.log(completion.choices[0].message.content);`}
                  </pre>
                </div>
              </div>
            )}

            {activeCategory === 'provider-config' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Provider Vault Configuration</h3>
                  <p className="text-xs text-[#555550]">Connect and rotate OpenAI, Anthropic, and Gemini credentials.</p>
                </div>
                <div className="space-y-3 text-xs text-[#555550]">
                  <p>In the <strong>Key Vault</strong> workspace, you can register multiple provider credentials. Each key is encrypted immediately upon submission.</p>
                  <p>SpendGuard supports automatic provider rotation: if OpenAI experiences an upstream outage, you can seamlessly switch requests to Claude 3.5 Sonnet or Gemini 1.5 Pro without modifying client code.</p>
                </div>
              </div>
            )}

            {activeCategory === 'budget-enforcement' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Budget Enforcement & Fail-Closed Guardrails</h3>
                  <p className="text-xs text-[#555550]">How SpendGuard guarantees zero unmetered financial runaway.</p>
                </div>
                <div className="space-y-3 text-xs text-[#555550] leading-relaxed">
                  <p><strong>1. Pre-Flight Ceiling Check:</strong> Before sending requests to providers, the gateway calculates worst-case cost (<code className="font-mono text-[#FF6B35]">(max_tokens * output_rate) + input_cost</code>).</p>
                  <p><strong>2. Fail-Closed Guarantee:</strong> If a project has insufficient balance, the gateway immediately returns HTTP 429 <code className="font-mono text-red-600">budget_exceeded</code>. If Redis is unreachable, it fails closed with HTTP 503 <code className="font-mono text-red-600">governance_unavailable</code> to protect financial liability.</p>
                </div>
              </div>
            )}

            {activeCategory === 'key-security' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">AES-256-GCM Envelope Encryption</h3>
                  <p className="text-xs text-[#555550]">Cryptographic verification and zero-leakage security.</p>
                </div>
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-2 text-xs text-[#555550]">
                  <p>All provider secrets are encrypted using the <strong>AES-256-GCM</strong> authenticated encryption standard. Each key receives a unique 16-byte initialization vector (IV) and a 16-byte authentication tag.</p>
                  <p>Virtual gateway tokens (<code className="font-mono text-[#FF6B35]">sg_live_*</code>) are hashed with SHA-256 prior to storage. It is mathematically impossible for an attacker with database read access to extract raw provider keys or raw gateway secrets.</p>
                </div>
              </div>
            )}

            {activeCategory === 'billing' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Subscriptions & Stripe Billing</h3>
                  <p className="text-xs text-[#555550]">Plan limits, quotas, and subscription synchronization.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl border border-[#E4E4E0] bg-white space-y-1">
                    <p className="font-bold text-[#141413]">Starter Plan</p>
                    <p className="font-mono text-[#FF6B35]">$49 / month</p>
                    <p className="text-[#888882] text-[11px]">Up to $2,500 monthly AI spend, 3 projects, 50k RPM.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-[#FFD2C0] bg-[#FFF7F2] space-y-1">
                    <p className="font-bold text-[#141413]">Growth Plan</p>
                    <p className="font-mono text-[#FF6B35]">$199 / month</p>
                    <p className="text-[#888882] text-[11px]">Up to $25,000 monthly AI spend, 15 projects, Z-score anomalies.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-[#E4E4E0] bg-white space-y-1">
                    <p className="font-bold text-[#141413]">Enterprise</p>
                    <p className="font-mono text-[#FF6B35]">Custom Pricing</p>
                    <p className="text-[#888882] text-[11px]">Unlimited spend, dedicated Redis clusters, custom SLAs.</p>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'troubleshooting' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-normal text-[#141413]">Troubleshooting & Error Codes</h3>
                  <p className="text-xs text-[#555550]">Quick diagnostic reference for standard SpendGuard error responses.</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-white border border-[#E4E4E0] space-y-1">
                    <span className="font-mono font-bold text-red-600">HTTP 429 budget_exceeded</span>
                    <p className="text-[#555550]">The target project has exhausted its monthly spend limit. Increase the monthly budget cap in the Projects view to resume traffic.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#E4E4E0] space-y-1">
                    <span className="font-mono font-bold text-amber-600">HTTP 503 governance_unavailable</span>
                    <p className="text-[#555550]">The gateway Redis in-memory store is disconnected. Under the fail-closed policy, requests are blocked until Redis returns healthy.</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#E4E4E0] space-y-1">
                    <span className="font-mono font-bold text-zinc-800">HTTP 401 invalid_token</span>
                    <p className="text-[#555550]">The virtual gateway token (<code className="font-mono">sg_live_*</code>) is invalid, revoked, or formatted incorrectly. Issue a new key from Key Vault.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E4E4E0] bg-[#FAF8F5] flex items-center justify-between text-xs text-[#555550] shrink-0">
          <span>Need specialized enterprise assistance? Contact <strong className="text-[#141413]">support@dattreo.com</strong></span>
          <button
            onClick={() => {
              onClose();
              onNavigateToSdk();
            }}
            className="inline-flex items-center gap-1 text-[#FF6B35] font-semibold hover:underline"
          >
            <span>View SDK Integration Guide</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

