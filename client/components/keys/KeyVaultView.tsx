'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  X,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/LoadingSkeleton';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';

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
  // Target project for the modals: the user's pick, else the header's project, else the first one.
  // Picking a different project in the header resets the pick.
  const [pickedProjectId, setModalProjectId] = useState<string | null>(null);
  const [prevSelectedProjectId, setPrevSelectedProjectId] = useState(selectedProjectId);
  if (selectedProjectId !== prevSelectedProjectId) {
    setPrevSelectedProjectId(selectedProjectId);
    setModalProjectId(null);
  }
  const modalProjectId = pickedProjectId || selectedProjectId || projects[0]?.id || '';
  const [provider, setProvider] = useState<'OPENAI' | 'ANTHROPIC' | 'GEMINI'>('OPENAI');
  const [keyName, setKeyName] = useState('');
  const [plainKey, setPlainKey] = useState('');
  const [rateLimit, setRateLimit] = useState('1200');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleTestProvider = async () => {
    if (!plainKey) return;
    setIsTestingProvider(true);
    setTestResult(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/keys/provider/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider, apiKey: plainKey }),
      });
      if (!res.ok) throw new Error(await readApiError(res, `HTTP ${res.status}`));
      setTestResult(await res.json());
    } catch (err: unknown) {
      setTestResult({ valid: false, message: `Test failed: ${errorMessage(err)}` });
    } finally {
      setIsTestingProvider(false);
    }
  };

  const fetchKeys = useCallback(
    () =>
      authFetch(selectedProjectId ? `/api/v1/keys?projectId=${encodeURIComponent(selectedProjectId)}` : '/api/v1/keys')
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data: { providerKeys?: ProviderKey[]; gatewayKeys?: GatewayKey[] }) => {
          setProviderKeys(data.providerKeys || []);
          setGatewayKeys(data.gatewayKeys || []);
        })
        .catch((err) => console.error('Failed to fetch keys:', err))
        .finally(() => setIsLoading(false)),
    [selectedProjectId],
  );

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/keys', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
        setTestResult(null);
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/keys', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch(`/api/v1/keys?id=${id}&type=${type}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to revoke key:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl font-normal text-[#141413] tracking-tight">
          Key Vault & Gateway Tokens
        </h2>
        <p className="text-xs text-[#5F6368] mt-1">
          Two-tier envelope encryption (AES-256-GCM). Zero plaintext provider credentials stored or returned.
        </p>
      </div>

      {/* Section 1: Provider API Keys Table */}
      <div className="bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-[#E4E4E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#FF6B35]" />
              <h3 className="font-serif text-lg font-normal text-[#141413]">
                Upstream Provider Credentials (AES-256-GCM Encrypted)
              </h3>
            </div>
            <p className="text-xs text-[#5F6368] mt-0.5">
              Injected into upstream OpenAI, Anthropic, and Gemini API requests in memory.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setTestResult(null);
              setShowAddProviderKeyModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Provider Key</span>
          </button>
        </div>

        {isLoading && providerKeys.length === 0 ? (
          <div className="p-6">
            <TableRowSkeleton count={2} />
          </div>
        ) : providerKeys.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={KeyRound}
              title="No provider keys connected"
              description="Connect your upstream OpenAI, Anthropic, or Gemini API keys to route real model inference."
              actionText="Connect Provider Key"
              onAction={() => setShowAddProviderKeyModal(true)}
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Provider</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Key Alias</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Bound Project</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Masked Secret</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Encryption</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Created</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#141413]">
                {providerKeys.map((pk) => (
                  <tr key={pk.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-xs px-2.5 py-0.5 rounded-full bg-[#F3F3F0] border border-[#E4E4E0] text-[#141413]">
                        {pk.provider}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#141413]">{pk.keyName}</td>
                    <td className="py-3.5 px-4 text-[#5F6368]">{pk.projectName || pk.projectId}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-[#5F6368]">{pk.keyPrefix}••••••••</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[11px] text-[#0D9488] font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Envelope AES-256</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#80868B] text-[11px]">
                      {new Date(pk.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevokeKey(pk.id, 'PROVIDER')}
                        className="px-3 py-1 rounded-full text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
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

      {/* Section 2: Scoped Client Gateway Tokens Table */}
      <div className="bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-[#E4E4E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#FF6B35]" />
              <h3 className="font-serif text-lg font-normal text-[#141413]">
                Scoped Client Gateway Tokens (`sg_live_*`)
              </h3>
            </div>
            <p className="text-xs text-[#5F6368] mt-0.5">
              Issue tokens to backend applications with rate limits and project budget bounds.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowGenerateGatewayKeyModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#141413] hover:bg-[#2E3033] text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Gateway Key</span>
          </button>
        </div>

        {isLoading && gatewayKeys.length === 0 ? (
          <div className="p-6">
            <TableRowSkeleton count={2} />
          </div>
        ) : gatewayKeys.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={KeyRound}
              title="No gateway tokens generated"
              description="Generate a client token to begin routing OpenAI-compatible SDK requests."
              actionText="Generate Token"
              onAction={() => setShowGenerateGatewayKeyModal(true)}
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Token Name</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Bound Project</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Key Prefix</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Rate Limit</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#141413]">
                {gatewayKeys.map((gk) => (
                  <tr key={gk.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-[#141413]">{gk.keyName}</td>
                    <td className="py-3.5 px-4 text-[#5F6368]">{gk.projectName || gk.projectId}</td>
                    <td className="py-3.5 px-4 font-mono text-[#FF6B35] font-semibold">{gk.keyPrefix}••••••••</td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-[#5F6368]">{gk.rateLimitRpm} rpm</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
                        Active
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevokeKey(gk.id, 'GATEWAY')}
                        className="px-3 py-1 rounded-full text-xs font-semibold text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] p-6 max-w-md w-full border border-[#E4E4E0] shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E0]">
              <h3 className="font-serif text-lg font-normal text-[#141413]">Connect Provider API Key</h3>
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="p-1.5 text-[#80868B] hover:text-[#141413] rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#141413] block mb-1.5">Target Project *</label>
                <select
                  value={modalProjectId}
                  onChange={(e) => setModalProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs font-medium text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#141413] block mb-1.5">AI Provider *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['OPENAI', 'ANTHROPIC', 'GEMINI'] as const).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => {
                        setProvider(prov);
                        setTestResult(null);
                      }}
                      className={`py-2 rounded-full text-xs font-semibold transition-colors border ${
                        provider === prov
                          ? 'bg-[#FFF7F2] text-[#FF6B35] border-[#FFD2C0]'
                          : 'bg-white text-[#5F6368] border-[#E4E4E0] hover:bg-[#FAF8F5]'
                      }`}
                    >
                      {prov}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#141413] block mb-1.5">Key Alias / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Production Primary OpenAI"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-[#141413]">Plaintext API Key (Write-Once) *</label>
                  <button
                    type="button"
                    onClick={handleTestProvider}
                    disabled={isTestingProvider || !plainKey}
                    className="text-[11px] font-semibold text-[#FF6B35] hover:underline disabled:opacity-50"
                  >
                    {isTestingProvider ? 'Testing live...' : '⚡ Test Connection'}
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  value={plainKey}
                  onChange={(e) => {
                    setPlainKey(e.target.value);
                    setTestResult(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs font-mono text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                />
                {testResult && (
                  <div
                    className={`mt-2 p-2.5 rounded-2xl text-xs font-medium flex items-center gap-2 ${
                      testResult.valid
                        ? 'bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]'
                        : 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                    }`}
                  >
                    <span>{testResult.valid ? '✓' : '✕'}</span>
                    <span>{testResult.message}</span>
                  </div>
                )}
                <p className="text-[11px] text-[#80868B] mt-1">
                  Encrypted immediately with AES-256-GCM. Plaintext is never stored or returned.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E4E4E0] flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#5F6368] hover:bg-[#F3F3F0] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddProviderKey}
                disabled={isSubmitting || !plainKey || !keyName}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#E55A25] disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Encrypting...' : 'Save & Encrypt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generate Gateway Key */}
      {showGenerateGatewayKeyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] p-6 max-w-md w-full border border-[#E4E4E0] shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E0]">
              <h3 className="font-serif text-lg font-normal text-[#141413]">Issue Gateway API Token</h3>
              <button
                type="button"
                onClick={() => {
                  setShowGenerateGatewayKeyModal(false);
                  setNewGatewaySecret(null);
                }}
                className="p-1.5 text-[#80868B] hover:text-[#141413] rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newGatewaySecret ? (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl text-[#0D9488]">
                  <p className="font-semibold">Token Generated Successfully</p>
                  <p className="text-[11px] mt-0.5">
                    Save this secret now. For security, it cannot be displayed again.
                  </p>
                </div>

                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Gateway Secret Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newGatewaySecret}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] bg-[#FAF8F5] font-mono text-xs font-semibold text-[#FF6B35]"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(newGatewaySecret, 'secret')}
                      className="px-4 py-2.5 bg-[#F3F3F0] hover:bg-[#E4E4E0] rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      {copiedId === 'secret' ? <Check className="w-3.5 h-3.5 text-[#0D9488]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedId === 'secret' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGenerateGatewayKeyModal(false);
                      setNewGatewaySecret(null);
                    }}
                    className="px-5 py-2 bg-[#141413] hover:bg-[#2E3033] text-white text-xs font-semibold rounded-full shadow-2xs transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Target Project *</label>
                  <select
                    value={modalProjectId}
                    onChange={(e) => setModalProjectId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs font-medium text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Token Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. Backend Production Server"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#141413] block mb-1.5">Rate Limit (Requests per minute)</label>
                  <input
                    type="number"
                    min="60"
                    step="60"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] font-mono text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div className="pt-3 border-t border-[#E4E4E0] flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowGenerateGatewayKeyModal(false)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-[#5F6368] hover:bg-[#F3F3F0] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateGatewayKey}
                    disabled={isSubmitting || !keyName}
                    className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-[#141413] hover:bg-[#2E3033] disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    {isSubmitting ? 'Generating...' : 'Generate Secret'}
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
