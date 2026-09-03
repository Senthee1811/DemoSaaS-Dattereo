'use client';

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Copy, 
  Check, 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  Cpu, 
  Layers, 
  AlertTriangle,
  X,
  Sparkles
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

interface ProviderKey {
  id: string;
  projectId: string;
  projectName?: string;
  provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  keyName: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

interface GatewayKey {
  id: string;
  projectId: string;
  projectName?: string;
  keyName: string;
  keyPrefix: string;
  rateLimitRpm: number;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

interface KeyVaultViewProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId?: string;
}

export function KeyVaultView({ projects, selectedProjectId }: KeyVaultViewProps) {
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [gatewayKeys, setGatewayKeys] = useState<GatewayKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals
  const [showAddProviderKeyModal, setShowAddProviderKeyModal] = useState(false);
  const [showGenerateGatewayKeyModal, setShowGenerateGatewayKeyModal] = useState(false);
  const [newGatewaySecret, setNewGatewaySecret] = useState<string | null>(null);

  // Form State
  const [modalProjectId, setModalProjectId] = useState(selectedProjectId || projects[0]?.id || '');
  const [provider, setProvider] = useState<'OPENAI' | 'ANTHROPIC' | 'GEMINI'>('OPENAI');
  const [keyName, setKeyName] = useState('');
  const [plainKey, setPlainKey] = useState('');
  const [rateLimit, setRateLimit] = useState('1200');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const url = selectedProjectId ? `/api/v1/keys?projectId=${selectedProjectId}` : '/api/v1/keys';
      const res = await fetch(url);
      const data = await res.json();
      setProviderKeys(data.providerKeys || []);
      setGatewayKeys(data.gatewayKeys || []);
    } catch (err) {
      console.error('Failed to fetch keys:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      setModalProjectId(selectedProjectId);
    } else if (projects.length > 0 && !modalProjectId) {
      setModalProjectId(projects[0].id);
    }
  }, [selectedProjectId, projects]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Add Provider Key
  const handleAddProviderKey = async () => {
    if (!plainKey || !keyName || !modalProjectId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PROVIDER',
          projectId: modalProjectId,
          provider,
          keyName,
          plainKey
        })
      });
      if (res.ok) {
        setShowAddProviderKeyModal(false);
        setKeyName('');
        setPlainKey('');
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to store provider key:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate Gateway Key
  const handleGenerateGatewayKey = async () => {
    if (!keyName || !modalProjectId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GATEWAY',
          projectId: modalProjectId,
          keyName,
          rateLimitRpm: Number(rateLimit)
        })
      });
      const data = await res.json();
      if (res.ok && data.secret) {
        setNewGatewaySecret(data.secret);
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to generate gateway key:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Revoke Key
  const handleRevokeKey = async (id: string, type: 'PROVIDER' | 'GATEWAY') => {
    try {
      const res = await fetch(`/api/v1/keys?id=${id}&type=${type}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to revoke key:', err);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
          Key Vault & Gateway Tokens
        </h2>
        <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
          Encrypted at rest with AES-256-GCM. Rotate master provider keys without code deployments.
        </p>
      </div>

      {/* Section 1: Provider API Keys */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F0ECE7]">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#FF6B35]" />
              <h3 className="text-base font-bold text-[#111111]">
                Master Provider Keys (AES-256 Encrypted)
              </h3>
            </div>
            <p className="text-xs text-[#777777] mt-0.5">
              Securely stored in hardware-level encryption vault; injected into proxy requests on-the-fly.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddProviderKeyModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm hover:scale-[1.02] transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Provider Key</span>
          </button>
        </div>

        {providerKeys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No provider keys connected"
            description="Add your OpenAI, Claude, or Gemini API keys to enable live gateway proxying."
            actionText="Add Provider Key"
            onAction={() => setShowAddProviderKeyModal(true)}
            compact
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providerKeys.map((pk) => (
              <div
                key={pk.id}
                className="p-5 rounded-2xl bg-[#FFF8F5]/60 border border-[#E8E8E8] hover:border-[#FFD9C7] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-[#FF6B35] bg-[#FFF1EA] px-2 py-0.5 rounded-md border border-[#FFD9C7]">
                      {pk.provider}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Encrypted</span>
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#111111]">{pk.keyName}</h4>
                  <p className="text-xs text-[#777777] mt-0.5">
                    Project: {pk.projectName || pk.projectId}
                  </p>

                  <div className="mt-3 p-2 bg-white rounded-xl border border-[#E8E8E8] font-mono text-xs text-[#666666] flex items-center justify-between">
                    <span>{pk.keyPrefix}••••••••••••</span>
                    <Lock className="w-3 h-3 text-[#FF6B35]" />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#E8E8E8] flex items-center justify-between text-[11px] text-[#777777]">
                  <span>Added {new Date(pk.createdAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => handleRevokeKey(pk.id, 'PROVIDER')}
                    className="text-red-500 hover:text-red-700 font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Revoke</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Scoped Client Gateway API Keys */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F0ECE7]">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#FF6B35]" />
              <h3 className="text-base font-bold text-[#111111]">
                Scoped Client Gateway Tokens
              </h3>
            </div>
            <p className="text-xs text-[#777777] mt-0.5">
              Issue tokens to backend services and developers with rate limits and project budget bounds.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowGenerateGatewayKeyModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm hover:scale-[1.02] transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Gateway Token</span>
          </button>
        </div>

        {gatewayKeys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No gateway tokens generated"
            description="Generate a client token to begin routing OpenAI-compatible SDK requests."
            actionText="Generate Token"
            onAction={() => setShowGenerateGatewayKeyModal(true)}
            compact
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F0ECE7] text-[#777777] uppercase text-[10.5px]">
                  <th className="pb-3 font-bold">Token Name</th>
                  <th className="pb-3 font-bold">Bound Project</th>
                  <th className="pb-3 font-bold">Key Prefix</th>
                  <th className="pb-3 font-bold">Rate Limit</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F2ED]">
                {gatewayKeys.map((gk) => (
                  <tr key={gk.id} className="hover:bg-[#FFF8F5]/60 transition-colors">
                    <td className="py-3.5 font-bold text-[#111111]">{gk.keyName}</td>
                    <td className="py-3.5 text-[#666666]">{gk.projectName || gk.projectId}</td>
                    <td className="py-3.5 font-mono text-[#FF6B35] font-semibold">{gk.keyPrefix}••••••••</td>
                    <td className="py-3.5 font-mono text-[#666666]">{gk.rateLimitRpm} rpm</td>
                    <td className="py-3.5">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                        Active
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevokeKey(gk.id, 'GATEWAY')}
                        className="text-red-500 hover:text-red-700 font-bold text-xs"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add Provider Key */}
      {showAddProviderKeyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E8E8E8] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E8]">
              <h3 className="text-lg font-bold text-[#111111]">
                Store Encrypted Provider Key
              </h3>
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="p-1 text-[#888888] hover:text-[#111111] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Target Project *
                </label>
                <select
                  value={modalProjectId}
                  onChange={(e) => setModalProjectId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  AI Provider *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['OPENAI', 'ANTHROPIC', 'GEMINI'] as const).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setProvider(prov)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                        provider === prov
                          ? 'bg-[#FFF1EA] text-[#FF6B35] border-[#FF6B35]'
                          : 'bg-white text-[#666666] border-[#E8E8E8]'
                      }`}
                    >
                      {prov}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Key Label / Nickname *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Production OpenAI Primary"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Plaintext API Key (Write-Once) *
                </label>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={plainKey}
                  onChange={(e) => setPlainKey(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                />
                <p className="text-[10.5px] text-[#777777] mt-1">
                  Key is encrypted with AES-256 before storage and never returned in plaintext.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8E8E8] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666666] hover:bg-[#F5F5F5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddProviderKey}
                disabled={isSubmitting || !plainKey || !keyName}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Encrypting...' : 'Save & Encrypt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generate Gateway Key */}
      {showGenerateGatewayKeyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E8E8E8] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E8]">
              <h3 className="text-lg font-bold text-[#111111]">
                {newGatewaySecret ? 'Gateway Token Generated' : 'Generate Gateway Token'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowGenerateGatewayKeyModal(false);
                  setNewGatewaySecret(null);
                }}
                className="p-1 text-[#888888] hover:text-[#111111] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newGatewaySecret ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <div className="text-xs font-bold text-emerald-800 mb-1">
                    Copy your secret key now
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    This token will not be displayed again. Use it as your Bearer token in the OpenAI SDK.
                  </p>
                </div>

                <div className="p-3 bg-[#111111] rounded-xl text-white font-mono text-xs flex items-center justify-between break-all">
                  <span className="text-[#FFA06E] select-all">{newGatewaySecret}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(newGatewaySecret, 'secret')}
                    className="ml-2 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white flex-shrink-0"
                  >
                    {copiedId === 'secret' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGenerateGatewayKeyModal(false);
                      setNewGatewaySecret(null);
                    }}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                    Target Project *
                  </label>
                  <select
                    value={modalProjectId}
                    onChange={(e) => setModalProjectId(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                    Token Label *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CI/CD Integration Token"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                    Rate Limit (RPM)
                  </label>
                  <input
                    type="number"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div className="pt-3 border-t border-[#E8E8E8] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGenerateGatewayKeyModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666666] hover:bg-[#F5F5F5]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateGatewayKey}
                    disabled={isSubmitting || !keyName}
                    className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? 'Generating...' : 'Generate Token'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
