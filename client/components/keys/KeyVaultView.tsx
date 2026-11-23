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
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { ProviderSelect } from '@/components/ui/ProviderSelect';
import { DEFAULT_PROVIDER_ID, providerKeyPlaceholder, providerLabel, providerNames, type ProviderId } from '@/lib/providers';
import { useEscapeToClose, ConfirmDialog, InlineAlert, useToast } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { NumberInput } from '@/components/ui/NumberInput';
import { RATE_LIMIT_RPM, isNumberInRange } from '@/lib/limits';
import { useScope } from '@/lib/scope';
import { CredentialProtection } from './CredentialProtection';
import { Tip } from '@/components/ui/tooltip';

interface ProviderKey {
  id: string;
  projectId: string;
  projectName?: string;
  provider: ProviderId;
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

export function KeyVaultView() {
  // Global scope: the key lists follow it, and the create forms default to it
  const { scopeId: selectedProjectId, projects } = useScope();
  const toast = useToast();
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
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER_ID);
  const [keyName, setKeyName] = useState('');
  const [plainKey, setPlainKey] = useState('');
  const [rateLimit, setRateLimit] = useState('1200');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  useEscapeToClose(showAddProviderKeyModal, () => setShowAddProviderKeyModal(false));
  useEscapeToClose(showGenerateGatewayKeyModal, () => {
    setShowGenerateGatewayKeyModal(false);
    setNewGatewaySecret(null);
  });
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

  // Revoke Key (Type D): confirmed in the shared dialog; the dialog shows any failure
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; type: 'PROVIDER' | 'GATEWAY'; name: string } | null>(null);
  const revokeKey = async (id: string, type: 'PROVIDER' | 'GATEWAY') => {
    const res = await authFetch(`/api/v1/keys?id=${encodeURIComponent(id)}&type=${type}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await readApiError(res, 'The key could not be revoked.'));
    fetchKeys();
    toast.success(type === 'GATEWAY' ? 'Gateway key revoked' : 'Provider key removed');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">
          Key Vault & Gateway Tokens
        </h2>
        <p className="text-xs text-fg-secondary mt-1">
          Connect your AI provider keys and issue gateway tokens for your apps.
        </p>
      </div>

      <CredentialProtection keys={providerKeys} />

      {/* Section 1: Provider API Keys Table */}
      <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-accent" />
              <h3 className="font-serif text-lg font-normal text-fg">
                Upstream Provider Credentials (AES-256-GCM Encrypted)
              </h3>
            </div>
            <p className="text-xs text-fg-secondary mt-0.5">
              Injected into upstream {providerNames()} API requests in memory.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setTestResult(null);
              setShowAddProviderKeyModal(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
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
              title="Provider key: not configured"
              description={`Gateway requests fail with missing_provider_key until you connect a ${providerNames('or')} key for the project.`}
              actionText="Connect Provider Key"
              onAction={() => setShowAddProviderKeyModal(true)}
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-fg-secondary font-semibold border-b border-line">
                <tr>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Provider</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Key Alias</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Bound Project</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Masked Secret</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Encryption</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Created</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-fg">
                {providerKeys.map((pk) => (
                  <tr key={pk.id} className="hover:bg-surface-subtle transition-colors">
                    <td className="py-3.5 px-4">
                      <Badge leading={<ProviderLogo provider={pk.provider} size={12} />}>{providerLabel(pk.provider)}</Badge>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-fg">
                      <span className="block max-w-[14rem] truncate" title={pk.keyName}>{pk.keyName}</span>
                    </td>
                    <td className="py-3.5 px-4 text-fg-secondary">
                      <span className="block max-w-[12rem] truncate" title={pk.projectName || pk.projectId}>{pk.projectName || pk.projectId}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-fg-secondary whitespace-nowrap">{pk.keyPrefix}••••••••</td>
                    <td className="py-3.5 px-4">
                      <Badge tone="success" icon={ShieldCheck}>Envelope AES-256</Badge>
                    </td>
                    <td className="py-3.5 px-4 text-fg-muted text-label">
                      {new Date(pk.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingRevoke({ id: pk.id, type: 'PROVIDER', name: pk.keyName })}
                        className="px-3 py-1 rounded-full text-xs font-semibold text-critical hover:bg-critical-bg transition-colors"
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
      <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-accent" />
              <h3 className="font-serif text-lg font-normal text-fg">
                Scoped Client Gateway Tokens (`sg_live_*`)
              </h3>
            </div>
            <p className="text-xs text-fg-secondary mt-0.5">
              Issue tokens to backend applications with rate limits and project budget bounds.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowGenerateGatewayKeyModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-code hover:bg-[#2E3033] text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
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
              <thead className="bg-surface-subtle text-fg-secondary font-semibold border-b border-line">
                <tr>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Token Name</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Bound Project</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Key Prefix</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Rate Limit</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-fg">
                {gatewayKeys.map((gk) => (
                  <tr key={gk.id} className="hover:bg-surface-subtle transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-fg">
                      <span className="block max-w-[14rem] truncate" title={gk.keyName}>{gk.keyName}</span>
                    </td>
                    <td className="py-3.5 px-4 text-fg-secondary">
                      <span className="block max-w-[12rem] truncate" title={gk.projectName || gk.projectId}>{gk.projectName || gk.projectId}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-accent font-semibold whitespace-nowrap">{gk.keyPrefix}••••••••</td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-fg-secondary">{gk.rateLimitRpm} rpm</td>
                    <td className="py-3.5 px-4">
                      <Badge tone="success">Active</Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPendingRevoke({ id: gk.id, type: 'GATEWAY', name: gk.keyName })}
                        className="px-3 py-1 rounded-full text-xs font-semibold text-critical hover:bg-critical-bg transition-colors"
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
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-serif text-lg font-normal text-fg">Connect Provider API Key</h3>
              <Tip label="Close">
                <button aria-label="Close"
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              </Tip>
            </div>

            <div className="space-y-4 text-xs">
              <InlineAlert variant="confirmation" title="What connecting a key does">
                Gateway requests for this provider&apos;s models in the selected project are sent with this key and billed
                to its account, starting with the next request. Keep one key per provider per project: if there are
                several, which one is used is not defined.
              </InlineAlert>
              <div>
                <label className="font-semibold text-fg block mb-1.5">Target Project *</label>
                <select
                  value={modalProjectId}
                  onChange={(e) => setModalProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs font-medium text-fg focus:outline-none focus:border-accent"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-fg block mb-1.5">AI Provider *</label>
                <ProviderSelect
                  value={provider}
                  onValueChange={(id) => {
                    setProvider(id as ProviderId);
                    setTestResult(null);
                  }}
                  aria-label="AI provider"
                />
              </div>

              <div>
                <label className="font-semibold text-fg block mb-1.5">Key Alias / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Production Primary OpenAI"
                  value={keyName}
                  maxLength={120}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-fg">Plaintext API Key (Write-Once) *</label>
                  <button
                    type="button"
                    onClick={handleTestProvider}
                    disabled={isTestingProvider || !plainKey}
                    className="text-label font-semibold text-accent hover:underline disabled:opacity-50"
                  >
                    {isTestingProvider ? 'Testing live...' : '⚡ Test Connection'}
                  </button>
                </div>
                <input
                  type="password"
                  placeholder={providerKeyPlaceholder(provider)}
                  value={plainKey}
                  onChange={(e) => {
                    setPlainKey(e.target.value);
                    setTestResult(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs font-mono text-fg focus:outline-none focus:border-accent"
                />
                {testResult && (
                  <div
                    className={`mt-2 p-2.5 rounded-field text-xs font-medium flex items-center gap-2 ${
                      testResult.valid
                        ? 'bg-success-bg text-success border border-success-border'
                        : 'bg-critical-bg text-critical border border-critical-border'
                    }`}
                  >
                    <span>{testResult.valid ? '✓' : '✕'}</span>
                    <span>{testResult.message}</span>
                  </div>
                )}
                <p className="text-label text-fg-muted mt-1">
                  Encrypted immediately with AES-256-GCM. Plaintext is never stored or returned.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-line flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddProviderKeyModal(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-fg-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddProviderKey}
                disabled={isSubmitting || !plainKey || !keyName}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Encrypting...' : 'Save & Encrypt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generate Gateway Key */}
      {showGenerateGatewayKeyModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-line shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-serif text-lg font-normal text-fg">Issue Gateway API Token</h3>
              <Tip label="Close">
                <button aria-label="Close"
                type="button"
                onClick={() => {
                  setShowGenerateGatewayKeyModal(false);
                  setNewGatewaySecret(null);
                }}
                className="p-1.5 text-fg-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
              </Tip>
            </div>

            {newGatewaySecret ? (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-success-bg border border-success-border rounded-field text-success">
                  <p className="font-semibold">Token Generated Successfully</p>
                  <p className="text-label mt-0.5">
                    Save this secret now. For security, it cannot be displayed again.
                  </p>
                </div>

                <div>
                  <label className="font-semibold text-fg block mb-1.5">Gateway Secret Key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={newGatewaySecret}
                      className="w-full px-3.5 py-2.5 rounded-field border border-line bg-surface-subtle font-mono text-xs font-semibold text-accent"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(newGatewaySecret, 'secret')}
                      className="px-4 py-2.5 bg-surface-muted hover:bg-surface-muted rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      {copiedId === 'secret' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
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
                    className="px-5 py-2 bg-code hover:bg-[#2E3033] text-white text-xs font-semibold rounded-full shadow-2xs transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <InlineAlert variant="confirmation" title="Before you generate">
                  The secret is shown once. Anyone holding it can spend this project&apos;s budget through the gateway,
                  up to the limits set here, until the key is revoked.
                </InlineAlert>
                <div>
                  <label className="font-semibold text-fg block mb-1.5">Target Project *</label>
                  <select
                    value={modalProjectId}
                    onChange={(e) => setModalProjectId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs font-medium text-fg focus:outline-none focus:border-accent"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-fg block mb-1.5">Token Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. Backend Production Server"
                    value={keyName}
                    maxLength={120}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-field border border-line text-xs text-fg focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="font-semibold text-fg block mb-1.5">Rate Limit (Requests per minute)</label>
                  <NumberInput
                    value={rateLimit}
                    onValueChange={setRateLimit}
                    range={RATE_LIMIT_RPM}
                    step={60}
                    aria-label="Rate limit in requests per minute"
                  />
                </div>

                <div className="pt-3 border-t border-line flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowGenerateGatewayKeyModal(false)}
                    className="px-4 py-2 rounded-full text-xs font-semibold text-fg-secondary hover:bg-surface-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateGatewayKey}
                    disabled={isSubmitting || !keyName || !isNumberInRange(rateLimit, RATE_LIMIT_RPM)}
                    className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-code hover:bg-[#2E3033] disabled:opacity-50 transition-colors shadow-2xs"
                  >
                    {isSubmitting ? 'Generating...' : 'Generate Secret'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingRevoke !== null}
        tone="danger"
        title={pendingRevoke?.type === 'GATEWAY' ? `Revoke gateway key "${pendingRevoke?.name}"?` : `Remove provider key "${pendingRevoke?.name}"?`}
        description={
          pendingRevoke?.type === 'GATEWAY'
            ? 'The key is deleted and stops working immediately.'
            : 'The encrypted credential is deleted from the vault.'
        }
        consequences={
          pendingRevoke?.type === 'GATEWAY'
            ? [
                'Any app or script still using this key gets 401 on its next request.',
                'Past requests made with it stay in the audit ledger, but will no longer show which key made them.',
              ]
            : [
                "Requests for this provider's models in this project fail with missing_provider_key until another key is connected.",
                'Past requests stay in the audit ledger.',
              ]
        }
        reversible="This cannot be undone. A new key can be created, but this one cannot be restored."
        confirmLabel={pendingRevoke?.type === 'GATEWAY' ? 'Revoke key' : 'Remove key'}
        onConfirm={() => (pendingRevoke ? revokeKey(pendingRevoke.id, pendingRevoke.type) : undefined)}
        onClose={() => setPendingRevoke(null)}
      />
    </div>
  );
}
