import { providerForModel } from './providers';

/**
 * SpendGuard AI — Developer FinOps Precision Tokens
 * High-signal, accessible contrast color mapping for charts and UI state.
 */

export const TOKENS = {
  colors: {
    primaryOrange: '#FF6B35',
    primaryOrangeHover: '#E85520',
    primaryOrangeSubtle: '#FFF5F0',
    canvas: '#FBFBFA',
    surface: '#FFFFFF',
    surfaceMuted: '#F3F3F0',
    textPrimary: '#18191B',
    textSecondary: '#5F6368',
    textMuted: '#80868B',
    borderColor: '#E4E4E0',

    success: '#0D9488',
    successBg: '#F0FDF4',
    warning: '#D97706',
    warningBg: '#FFFBEB',
    critical: '#DC2626',
    criticalBg: '#FEF2F2',

    chart: {
      primary: '#FF6B35',
      blue: '#2563EB',
      teal: '#0D9488',
      purple: '#7C3AED',
      gray: '#71717A',
      grid: '#ECECE8',
    },
  },
} as const;

/**
 * Chart colour for a model: the shades of the provider whose model ids it matches (see
 * lib/providers.ts), with a stable per-model shade, so it works for any model ID the backend
 * serves and a new provider needs no change here. Unknown models are grey.
 */
export function modelChartColor(model: string): string {
  const id = model.toLowerCase();
  const family = providerForModel(id)?.chartShades;
  if (!family || family.length === 0) return '#71717A';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return family[hash % family.length];
}
