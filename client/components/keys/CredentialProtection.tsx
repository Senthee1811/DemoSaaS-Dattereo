import React from 'react';
import { Lock } from 'lucide-react';
import { formatDateTime, utcLabel } from '@/lib/format';
import { providerLabel } from '@/lib/providers';
import { Badge } from '@/components/ui/Badge';

/**
 * How the provider keys in this vault are protected. This used to be a card in personal account
 * settings, where it did not belong: it describes provider credentials, not your sign-in.
 * It states only what the backend does: keys are encrypted before storage, are never returned
 * after saving (only a masked preview), can be tested when added, and are rotated by hand.
 */
export function CredentialProtection({ keys }: { keys: Array<{ provider: string; lastUsedAt?: string }> }) {
  const byProvider = new Map<string, number>();
  for (const k of keys) byProvider.set(k.provider, (byProvider.get(k.provider) ?? 0) + 1);
  const lastUsed = keys
    .map((k) => k.lastUsedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);

  return (
    <section aria-label="Credential protection" className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-field bg-success-bg text-success shrink-0">
          <Lock className="w-4 h-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-lg text-fg leading-tight">Credential protection</h3>
            <Badge tone="success" mono>Encrypted at rest (AES-256-GCM)</Badge>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-field border border-line bg-surface-subtle p-3">
              <dt className="text-caption font-mono uppercase tracking-wider text-fg-muted">Keys stored</dt>
              <dd className="mt-1 font-semibold text-fg">
                {keys.length === 0
                  ? 'None yet'
                  : [...byProvider.entries()].map(([p, n]) => `${providerLabel(p)} ${n}`).join(' · ')}
              </dd>
            </div>
            <div className="rounded-field border border-line bg-surface-subtle p-3">
              <dt className="text-caption font-mono uppercase tracking-wider text-fg-muted">Last used by the gateway</dt>
              <dd className="mt-1 font-semibold text-fg" title={utcLabel(lastUsed)}>
                {lastUsed ? formatDateTime(lastUsed) : 'Not used yet'}
              </dd>
            </div>
            <div className="rounded-field border border-line bg-surface-subtle p-3">
              <dt className="text-caption font-mono uppercase tracking-wider text-fg-muted">After saving</dt>
              <dd className="mt-1 font-semibold text-fg">Shown only as a masked preview</dd>
            </div>
          </dl>

          <ul className="text-label text-fg-secondary space-y-1 list-disc pl-4">
            <li>Keys are encrypted before they are stored. The full key can&apos;t be viewed again, not even by you.</li>
            <li>Use Test Connection when you add a key to confirm the provider accepts it.</li>
            <li>To replace a key: add the new one, test it, then remove the old one. SpendGuard does not rotate keys automatically.</li>
            <li>Keep one key per provider per project; if there are several, which one is used is not defined.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
