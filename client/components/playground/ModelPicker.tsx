'use client';

import React from 'react';
import { CatalogModel, formatPricingDate, useModelCatalog } from '@/lib/model-catalog';
import { ProviderLogo, providerLabel } from '@/components/ui/ProviderLogo';

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

  React.useEffect(() => {
    if (loadedModels) onLoaded?.(loadedModels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedModels]);

  if (catalog.status === 'loading') {
    return (
      <div role="status" className="text-xs text-[#5F6368] py-6">
        Loading models…
      </div>
    );
  }

  if (catalog.status === 'error') {
    return (
      <div role="alert" className="rounded-2xl border border-[#F5C6B8] bg-[#FFF7F2] p-4 text-xs text-[#141413]">
        <p className="font-semibold">Couldn&apos;t load the model list.</p>
        <p className="text-[#5F6368] mt-1">{catalog.message}</p>
        <button
          type="button"
          onClick={catalog.reload}
          className="mt-3 px-3 py-1.5 rounded-full bg-[#FF6B35] text-white font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const asOf = formatPricingDate(catalog.meta?.pricingUpdatedAt);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {catalog.models.map((m) => (
          <button
            key={m.model}
            type="button"
            onClick={() => onSelect(m.model)}
            aria-pressed={selectedModel === m.model}
            className={`p-3 rounded-2xl text-left transition-colors border ${
              selectedModel === m.model
                ? 'bg-[#FFF7F2] border-[#FFD2C0] shadow-2xs'
                : 'bg-white border-[#E4E4E0] hover:bg-[#FAF8F5]'
            }`}
          >
            <div className="text-xs font-semibold text-[#141413] truncate">{m.displayName}</div>
            <div className="text-caption text-[#5F6368] mt-0.5 inline-flex items-center gap-1.5">
              <ProviderLogo provider={m.provider} size={14} />
              <span>{providerLabel(m.provider)}</span>
            </div>
            <div className="text-caption font-mono text-[#5F6368] mt-1">
              ${fmt(m.inputPricePerMillion)} in / ${fmt(m.outputPricePerMillion)} out
            </div>
            {m.providerStatus === 'missing' && (
              <div className="text-caption font-semibold text-[#B45309] mt-1">Provider no longer lists this model</div>
            )}
          </button>
        ))}
      </div>
      <p className="text-caption text-[#5F6368] mt-2">
        Prices per 1M tokens.{' '}
        {asOf ? `Pricing as of ${asOf}` : 'Pricing date unavailable'} — a maintained table, not a live provider feed.
      </p>
    </div>
  );
}
