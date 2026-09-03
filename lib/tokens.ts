/**
 * SpendGuard Design Tokens & Color System
 * Unified Orange + White Identity
 */

export const TOKENS = {
  colors: {
    primaryOrange: '#FF6B35',
    secondaryOrange: '#FF8A4C',
    lightOrange: '#FFF1EA',
    orangeGlow: 'rgba(255, 107, 53, 0.15)',
    background: '#FFFFFF',
    softBackground: '#FFF8F5',
    cardBackground: '#FFFFFF',
    textPrimary: '#111111',
    textSecondary: '#666666',
    textMuted: '#888888',
    borderColor: '#E8E8E8',
    borderLight: '#F2EFEA',
    darkElement: '#111111',

    // Semantic Status Colors
    success: '#10B981',
    successBg: '#ECFDF5',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    error: '#EF4444',
    errorBg: '#FEF2F2',

    // Chart Palette
    chart: {
      primary: '#FF6B35',
      secondary: '#FF8A4C',
      tertiary: '#FFA06E',
      quaternary: '#FFD4C2',
      dark: '#111111',
      gray: '#A3A3A3',
      grid: '#F0ECE7',
    },

    // AI Provider Brand Colors
    providers: {
      openai: '#10A37F',
      anthropic: '#D97706',
      google: '#4285F4',
    },
  },
} as const;

export const MODEL_CHART_COLORS: Record<string, string> = {
  'gpt-4o': '#FF6B35',
  'gpt-4o-mini': '#FF8A4C',
  'claude-3-5-sonnet-20241022': '#FFA06E',
  'claude-3-5-haiku-20241022': '#FFBD9B',
  'gemini-1.5-pro': '#111111',
  'gemini-1.5-flash': '#555555',
  'o1': '#888888',
  'default': '#CCCCCC'
};
