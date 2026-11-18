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

export const MODEL_CHART_COLORS: Record<string, string> = {
  'gpt-4o': '#FF6B35',
  'gpt-4o-mini': '#FB923C',
  'gpt-4-turbo': '#F97316',
  'claude-3-5-sonnet-20241022': '#2563EB',
  'claude-3-5-haiku-20241022': '#3B82F6',
  'claude-3-opus-20240229': '#1D4ED8',
  'gemini-1.5-pro': '#0D9488',
  'gemini-1.5-flash': '#14B8A6',
  'gemini-2.0-flash': '#059669',
  'o1': '#7C3AED',
  'o1-mini': '#8B5CF6',
  'default': '#71717A'
};
