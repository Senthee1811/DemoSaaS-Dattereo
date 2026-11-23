import React from 'react';
import { getProvider, providerLabel } from '@/lib/providers';

/**
 * Provider mark as an inline SVG, drawn from the registry in lib/providers.ts (this file holds
 * no provider data). Monochrome (currentColor) to match the app's neutral editorial palette;
 * the surrounding text colour decides the tint. Decorative by default: the provider name is
 * expected to sit next to it.
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
  const meta = getProvider(provider);
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
      {meta.icon ? (
        <path d={meta.icon.path} />
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
