'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProviderId } from '@/lib/providers';

/** One row of GET /api/v1/pricing (the backend's `model_pricing` table). */
export interface CatalogModel {
  model: string;
  provider: ProviderId;
  displayName: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPrice: number | null;
  contextWindow: number | null;
  source: string;
  /** When the PRICE last changed (not when it was last checked) */
  updatedAt: string | null;
  providerStatus: 'available' | 'missing' | null;
  retiresAt: string | null;
}

export interface CatalogMeta {
  pricingUpdatedAt: string | null;
  lastAvailabilityCheckAt: string | null;
  priceSource: string;
}

export type ModelCatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; models: CatalogModel[]; meta: CatalogMeta };

/**
 * Loads the model list and prices from the backend. There is deliberately no bundled
 * fallback list: if the request fails the caller shows an error, never stale data.
 */
export function useModelCatalog(): ModelCatalogState & { reload: () => void } {
  const [state, setState] = useState<ModelCatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/pricing', { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Pricing service returned HTTP ${res.status}`);
        const body = await res.json();
        if (!Array.isArray(body?.data)) throw new Error('Pricing service returned an unexpected response');
        setState({ status: 'ready', models: body.data as CatalogModel[], meta: body.meta as CatalogMeta });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Could not load the model list',
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}

/** "Nov 18, 2026" */
export function formatPricingDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Cheapest model for a provider by blended input+output rate (used for cheap test calls). */
export function cheapestModelFor(models: CatalogModel[], provider: CatalogModel['provider']): string | undefined {
  return models
    .filter((m) => m.provider === provider)
    .sort(
      (a, b) =>
        a.inputPricePerMillion + a.outputPricePerMillion - (b.inputPricePerMillion + b.outputPricePerMillion),
    )[0]?.model;
}
