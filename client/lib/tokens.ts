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

const PROVIDER_SHADES = {
  openai: ['#FF6B35', '#FB923C', '#F97316', '#EA580C'],
  anthropic: ['#2563EB', '#3B82F6', '#1D4ED8', '#60A5FA'],
  gemini: ['#0D9488', '#14B8A6', '#059669', '#2DD4BF'],
  groq: ['#7C3AED', '#8B5CF6', '#6D28D9', '#A78BFA'],
} as const;

/**
 * Chart colour for a model, keyed by provider family with a stable per-model shade, so it
 * works for any model ID the backend serves instead of a bundled per-model table.
 */
export function modelChartColor(model: string): string {
  const id = model.toLowerCase();
  const family = id.startsWith('claude')
    ? PROVIDER_SHADES.anthropic
    : id.startsWith('gemini')
      ? PROVIDER_SHADES.gemini
      : id.startsWith('gpt') || /^o\d/.test(id)
        ? PROVIDER_SHADES.openai
        : /^(llama-|meta-llama\/|openai\/|qwen\/|moonshotai\/|groq\/)/.test(id)
          ? PROVIDER_SHADES.groq
          : null;
  if (!family) return '#71717A';
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return family[hash % family.length];
}
