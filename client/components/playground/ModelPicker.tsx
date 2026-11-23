'use client';

import React from 'react';
import { CatalogModel, formatPricingDate, useModelCatalog } from '@/lib/model-catalog';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { ProviderSelect } from '@/components/ui/ProviderSelect';
import { providerLabel } from '@/lib/providers';

interface ModelPickerProps {
  selectedModel: string;
  onSelect: (model: string) => void;
  /** Reports the loaded list so the parent can pick a default once it arrives */
  onLoaded?: (models: CatalogModel[]) => void;
}

const fmt = (n: number) => (n >= 1 ? n.toFixed(2) : n.toFixed(n < 0.1 ? 3 : 2));

/**
 * Model cards driven entirely by GET /api/v1/pricing. No bundled model list and no
 * fallback: a failed request is an error state, not stale data.
 */
export function ModelPicker({ selectedModel, onSelect, onLoaded }: ModelPickerProps) {
  const catalog = useModelCatalog();
  const loadedModels = catalog.status === 'ready' ? catalog.models : null;
  // '' = all providers. Only narrows the live list; it never adds models of its own.
  const [providerFilter, setProviderFilter] = React.useState('');

  React.useEffect(() => {
    if (loadedModels) onLoaded?.(loadedModels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedModels]);

  if (catalog.status === 'loading') {
    return (
      <div role="status" className="text-xs text-fg-secondary py-6">
        Loading models…
      </div>
    );
  }

  if (catalog.status === 'error') {
    return (
      <div role="alert" className="rounded-field border border-accent-border bg-accent-subtle p-4 text-xs text-fg">
        <p className="font-semibold">Couldn&apos;t load the model list.</p>
        <p className="text-fg-secondary mt-1">{catalog.message}</p>
        <button
          type="button"
          onClick={catalog.reload}
          className="mt-3 px-3 py-1.5 rounded-full bg-accent text-white font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const asOf = formatPricingDate(catalog.meta?.pricingUpdatedAt);
  const visibleModels = providerFilter ? catalog.models.filter((m) => m.provider === providerFilter) : catalog.models;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 max-w-xs">
        <span className="text-label text-fg-secondary shrink-0">Provider</span>
        <ProviderSelect
          value={providerFilter}
          onValueChange={setProviderFilter}
          allowAll
          showDescriptions={false}
          aria-label="Filter models by provider"
        />
      </div>
      {visibleModels.length === 0 && (
        <p role="status" className="text-xs text-fg-secondary py-4">
          No priced {providerLabel(providerFilter)} models yet. Models need a confirmed price before the gateway will serve them.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {visibleModels.map((m) => (
          <button
            key={m.model}
            type="button"
            onClick={() => onSelect(m.model)}
            aria-pressed={selectedModel === m.model}
            className={`p-3 rounded-field text-left transition-colors border ${
              selectedModel === m.model
                ? 'bg-accent-subtle border-accent-border shadow-2xs'
                : 'bg-surface border-line hover:bg-surface-subtle'
            }`}
          >
            <div className="text-xs font-semibold text-fg truncate">{m.displayName}</div>
            <div className="text-caption text-fg-secondary mt-0.5 inline-flex items-center gap-1.5">
              <ProviderLogo provider={m.provider} size={14} />
              <span>{providerLabel(m.provider)}</span>
            </div>
            <div className="text-caption font-mono text-fg-secondary mt-1">
              ${fmt(m.inputPricePerMillion)} in / ${fmt(m.outputPricePerMillion)} out
            </div>
            {m.providerStatus === 'missing' && (
              <div className="text-caption font-semibold text-warning mt-1">Provider no longer lists this model</div>
            )}
          </button>
        ))}
      </div>
      <p className="text-caption text-fg-secondary mt-2">
        Prices per 1M tokens.{' '}
        {asOf ? `Pricing as of ${asOf}` : 'Pricing date unavailable'} — a maintained table, not a live provider feed.
      </p>
    </div>
  );
}
