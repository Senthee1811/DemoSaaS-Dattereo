import React from 'react';
import { siOpenai, siAnthropic, siGooglegemini } from 'simple-icons';

export type ProviderId = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ';

interface ProviderMeta {
  label: string;
  /** What the models are, for the onboarding picker. */
  desc: string;
  /** Example of the key format, shown as the input placeholder. */
  keyPlaceholder: string;
  /** simple-icons path. Absent when simple-icons has no mark for the brand (see GROQ). */
  path?: string;
}

/**
 * The one list of providers the UI knows about. A new provider is one entry here (plus its
 * backend enum value); Key Vault, onboarding and the logos all read from it.
 */
const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  OPENAI: { label: 'OpenAI', desc: 'GPT models', keyPlaceholder: 'sk-proj-...', path: siOpenai.path },
  ANTHROPIC: { label: 'Anthropic', desc: 'Claude models', keyPlaceholder: 'sk-ant-api03-...', path: siAnthropic.path },
  GEMINI: { label: 'Gemini', desc: 'Gemini models', keyPlaceholder: 'AIzaSy...', path: siGooglegemini.path },
  // simple-icons (any version) has no Groq mark, so Groq renders the "G" monogram below until
  // the official SVG path from Groq's brand kit is added here as `path`.
  GROQ: { label: 'Groq', desc: 'Open models, fast', keyPlaceholder: 'gsk_...' },
};

export const PROVIDER_LIST: Array<{ id: ProviderId } & ProviderMeta> = (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
  id,
  ...PROVIDERS[id],
}));

export function providerKeyPlaceholder(provider: string): string {
  return PROVIDERS[(provider || '').toUpperCase() as ProviderId]?.keyPlaceholder ?? '';
}

/** Accepts the API enum ('GEMINI') or lower case ('gemini'). Display only: the enum never changes. */
function lookup(provider: string) {
  return PROVIDERS[(provider || '').toUpperCase() as ProviderId];
}

export function providerLabel(provider: string): string {
  return lookup(provider)?.label ?? provider;
}

/**
 * Provider mark as an inline SVG. Monochrome (currentColor) to match the app's
 * neutral editorial palette; the surrounding text colour decides the tint.
 * Decorative by default: the provider name is expected to sit next to it.
 */
export function ProviderLogo({
  provider,
  size = 20,
  className = '',
  title,
}: {
  provider: string;
  size?: number;
  className?: string;
  /** Set when the logo stands alone (no adjacent text) so it has an accessible name. */
  title?: string;
}) {
  const meta = lookup(provider);
  if (!meta) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {meta.path ? (
        <path d={meta.path} />
      ) : (
        // No official mark available: a plain monogram, never an imitation of the brand's logo
        <>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
          <text x="12" y="16.6" textAnchor="middle" fontSize="12.5" fontWeight="700" fontFamily="system-ui, sans-serif" fill="currentColor">
            {meta.label.charAt(0)}
          </text>
        </>
      )}
    </svg>
  );
}

/** Logo plus provider name, for tables and cards. */
export function ProviderBadge({ provider, size = 18 }: { provider: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ProviderLogo provider={provider} size={size} />
      <span>{providerLabel(provider)}</span>
    </span>
  );
}
