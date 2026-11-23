import React from 'react';
import { siOpenai, siAnthropic, siGooglegemini } from 'simple-icons';

export type ProviderId = 'OPENAI' | 'ANTHROPIC' | 'GEMINI';

const PROVIDERS: Record<ProviderId, { label: string; path: string }> = {
  OPENAI: { label: 'OpenAI', path: siOpenai.path },
  ANTHROPIC: { label: 'Anthropic', path: siAnthropic.path },
  GEMINI: { label: 'Gemini', path: siGooglegemini.path },
};

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
      <path d={meta.path} />
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
