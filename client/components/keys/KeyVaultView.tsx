'use client';

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  ShieldCheck, 
  Lock, 
  X,
  Sparkles,
  Zap,
  Terminal,
  AlertCircle
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
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleTestProvider = async () => {
    if (!plainKey) return;
    setIsTestingProvider(true);
    setTestResult(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await fetch('/api/v1/keys/provider/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider, apiKey: plainKey }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ valid: false, message: `Test failed: ${err.message}` });
    } finally {
      setIsTestingProvider(false);
    }
  };

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const url = selectedProjectId ? `/api/v1/keys?projectId=${selectedProjectId}` : '/api/v1/keys';
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await fetch('/api/v1/keys', {
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
      const res = await fetch('/api/v1/keys', {
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
      const res = await fetch(`/api/v1/keys?id=${id}&type=${type}`, {
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
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[#18191B] tracking-tight">
          Key Vault & Gateway Tokens
        </h2>
        <p className="text-xs text-[#5F6368]">
          Two-tier envelope encryption (AES-256-GCM). Zero plaintext provider credentials stored or returned.
        </p>
      </div>

      {/* Section 1: Provider API Keys Table */}
      <div className="bg-white rounded-xl border border-[#E4E4E0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E4E4E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#FF6B35]" />
              <h3 className="text-sm font-semibold text-[#18191B]">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FF6B35] hover:bg-[#E85520] text-white font-semibold text-xs shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Provider Key</span>
          </button>
        </div>

        {providerKeys.length === 0 ? (
          <div className="p-6">
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
              <thead className="bg-[#F3F3F0] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-2.5 px-3.5">Provider</th>
                  <th className="py-2.5 px-3.5">Key Alias</th>
                  <th className="py-2.5 px-3.5">Bound Project</th>
                  <th className="py-2.5 px-3.5">Masked Secret</th>
                  <th className="py-2.5 px-3.5">Encryption</th>
                  <th className="py-2.5 px-3.5">Created</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#18191B]">
                {providerKeys.map((pk) => (
                  <tr key={pk.id} className="hover:bg-[#FBFBFA] transition-colors">
                    <td className="py-2.5 px-3.5">
                      <span className="font-semibold text-xs px-2 py-0.5 rounded bg-[#F3F3F0] border border-[#E4E4E0] text-[#18191B]">
                        {pk.provider}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-[#18191B]">{pk.keyName}</td>
                    <td className="py-2.5 px-3.5 text-[#5F6368]">{pk.projectName || pk.projectId}</td>
                    <td className="py-2.5 px-3.5 font-mono text-xs text-[#5F6368]">{pk.keyPrefix}••••••••</td>
                    <td className="py-2.5 px-3.5">
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#0D9488] font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Envelope AES-256</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-[#80868B] text-[11px]">
                      {new Date(pk.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevokeKey(pk.id, 'PROVIDER')}
                        className="text-xs font-semibold text-[#DC2626] hover:underline"
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
      <div className="bg-white rounded-xl border border-[#E4E4E0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E4E4E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#FF6B35]" />
              <h3 className="text-sm font-semibold text-[#18191B]">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#18191B] hover:bg-[#333333] text-white font-semibold text-xs shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Gateway Key</span>
          </button>
        </div>

        {gatewayKeys.length === 0 ? (
          <div className="p-6">
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
              <thead className="bg-[#F3F3F0] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-2.5 px-3.5">Token Name</th>
                  <th className="py-2.5 px-3.5">Bound Project</th>
                  <th className="py-2.5 px-3.5">Key Prefix</th>
                  <th className="py-2.5 px-3.5">Rate Limit</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#18191B]">
                {gatewayKeys.map((gk) => (
                  <tr key={gk.id} className="hover:bg-[#FBFBFA] transition-colors">
                    <td className="py-2.5 px-3.5 font-semibold text-[#18191B]">{gk.keyName}</td>
                    <td className="py-2.5 px-3.5 text-[#5F6368]">{gk.projectName || gk.projectId}</td>
                    <td className="py-2.5 px-3.5 font-mono text-[#FF6B35] font-semibold">{gk.keyPrefix}••••••••</td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-[#5F6368]">{gk.rateLimitRpm} rpm</td>
                    <td className="py-2.5 px-3.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
                        Active
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevokeKey(gk.id, 'GATEWAY')}
                        className="text-xs font-semibold text-[#DC2626] hover:underline"
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
          <div className="bg-white rounded-xl p-5 max-w-md w-full border border-[#E4E4E0] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E0]">
              <h3 className="text-sm font-bold text-[#18191B]">Connect Provider API Key</h3>
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="p-1 text-[#80868B] hover:text-[#18191B] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#18191B] block mb-1">Target Project *</label>
                <select
                  value={modalProjectId}
                  onChange={(e) => setModalProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs font-medium text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-[#18191B] block mb-1">AI Provider *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['OPENAI', 'ANTHROPIC', 'GEMINI'] as const).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => {
                        setProvider(prov);
                        setTestResult(null);
                      }}
                      className={`py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                        provider === prov
                          ? 'bg-[#FFF5F0] text-[#FF6B35] border-[#FFD2C0]'
                          : 'bg-white text-[#5F6368] border-[#E4E4E0]'
                      }`}
                    >
                      {prov}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#18191B] block mb-1">Key Alias / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Production Primary OpenAI"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#18191B]">Plaintext API Key (Write-Once) *</label>
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
                  className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs font-mono text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                />
                {testResult && (
                  <div
                    className={`mt-2 p-2 rounded-md text-xs font-medium flex items-center gap-2 ${
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

            <div className="pt-2 border-t border-[#E4E4E0] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#5F6368] hover:bg-[#F3F3F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddProviderKey}
                disabled={isSubmitting || !plainKey || !keyName}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#E85520] disabled:opacity-50 transition-colors"
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
          <div className="bg-white rounded-xl p-5 max-w-md w-full border border-[#E4E4E0] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E0]">
              <h3 className="text-sm font-bold text-[#18191B]">Issue Gateway API Token</h3>
              <button
                type="button"
                onClick={() => {
                  setShowGenerateGatewayKeyModal(false);
                  setNewGatewaySecret(null);
                }}
                className="p-1 text-[#80868B] hover:text-[#18191B] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newGatewaySecret ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-md text-[#0D9488]">
                  <p className="font-semibold">Token Generated Successfully</p>
                  <p className="text-[11px] mt-0.5">
                    Save this secret now. For security, it cannot be displayed again.
                  </p>
                </div>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Gateway Secret Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newGatewaySecret}
                      className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] bg-[#FBFBFA] font-mono text-xs font-semibold text-[#FF6B35]"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(newGatewaySecret, 'secret')}
                      className="px-3 py-2 bg-[#F3F3F0] hover:bg-[#E4E4E0] rounded-md text-xs font-semibold flex items-center gap-1 shrink-0"
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
                    className="px-3.5 py-1.5 bg-[#18191B] hover:bg-[#333333] text-white text-xs font-semibold rounded-md"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Target Project *</label>
                  <select
                    value={modalProjectId}
                    onChange={(e) => setModalProjectId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs font-medium text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Token Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. Backend Production Server"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#18191B] block mb-1">Rate Limit (Requests per minute)</label>
                  <input
                    type="number"
                    min="60"
                    step="60"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] font-mono text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                  />
                </div>

                <div className="pt-2 border-t border-[#E4E4E0] flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGenerateGatewayKeyModal(false)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#5F6368] hover:bg-[#F3F3F0]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateGatewayKey}
                    disabled={isSubmitting || !keyName}
                    className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#18191B] hover:bg-[#333333] disabled:opacity-50 transition-colors"
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
