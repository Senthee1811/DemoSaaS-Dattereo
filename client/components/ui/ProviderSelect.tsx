'use client';

import React from 'react';
import { PROVIDERS } from '@/lib/providers';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Option layout shared by the trigger and the list: logo and name on one aligned line. */
function ProviderOption({ id, label, desc }: { id: string; label: string; desc?: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <ProviderLogo provider={id} size={16} />
      <span className="font-medium">{label}</span>
      {desc && <span className="text-fg-muted truncate">{desc}</span>}
    </span>
  );
}

const ALL_PROVIDERS = '__all__'; // Radix items need a non-empty value

/**
 * The one provider picker. It maps over the registry (lib/providers.ts), so a provider added
 * there appears here with its logo and label and nothing else changes.
 * With `allowAll`, an extra "All providers" option represents no selection (value '').
 */
export function ProviderSelect({
  value,
  onValueChange,
  allowAll = false,
  allLabel = 'All providers',
  showDescriptions = true,
  id,
  'aria-label': ariaLabel = 'Provider',
  disabled,
  className,
}: {
  value: string;
  onValueChange: (id: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  showDescriptions?: boolean;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={allowAll && value === '' ? ALL_PROVIDERS : value}
      onValueChange={(v) => onValueChange(v === ALL_PROVIDERS ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue placeholder="Select a provider" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL_PROVIDERS}>{allLabel}</SelectItem>}
        {PROVIDERS.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <ProviderOption id={p.id} label={p.label} desc={showDescriptions ? p.desc : undefined} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
