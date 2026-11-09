/**
 * SpendGuard Design Tokens & Color System
 * 
 * Unified Orange + White Identity (Rule 7)
 * 
 * These tokens serve as the JS-side bridge to the centralized CSS theme
 * defined in globals.css via @theme. Chart libraries (Recharts) that need
 * inline color values use these constants.
 * 
 * The canonical source of truth for all colors is globals.css @theme block.
 * These values MUST match the CSS variables defined there.
 */

export const TOKENS = {
  colors: {
    // Core brand
    primaryOrange: 'var(--color-sg-primary, #FF6B35)',
    secondaryOrange: 'var(--color-sg-secondary, #FF8A4C)',
    lightOrange: 'var(--color-sg-light, #FFF1EA)',
    orangeGlow: 'rgba(255, 107, 53, 0.15)',
    background: 'var(--color-sg-background, #FFFFFF)',
    softBackground: 'var(--color-sg-soft-bg, #FFF8F5)',
    cardBackground: 'var(--color-sg-surface, #FFFFFF)',
    textPrimary: 'var(--color-sg-text-primary, #111111)',
    textSecondary: 'var(--color-sg-text-secondary, #666666)',
    textMuted: 'var(--color-sg-text-subtle, #888888)',
    borderColor: 'var(--color-sg-border, #E8E8E8)',
    borderLight: 'var(--color-sg-border-light, #F0ECE7)',
    darkElement: 'var(--color-sg-dark, #111111)',

    // Semantic Status Colors
    success: '#10B981',
    successBg: '#ECFDF5',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    error: '#EF4444',
    errorBg: '#FEF2F2',

    // Chart Palette (inline hex needed for Recharts — these MUST match @theme vars)
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

/**
 * Model-specific chart colors for the Spend by Model donut chart.
 * Recharts requires inline hex values — these are the only place
 * where raw hex is acceptable (chart libraries can't read CSS vars).
 * 
 * The values here derive from the SpendGuard orange palette plus
 * neutral grays for secondary models.
 */
export const MODEL_CHART_COLORS: Record<string, string> = {
  'gpt-4o': '#FF6B35',
  'gpt-4o-mini': '#FF8A4C',
  'gpt-4-turbo': '#FFA06E',
  'gpt-3.5-turbo': '#FFBD9B',
  'claude-3-5-sonnet-20241022': '#FFA06E',
  'claude-3-5-haiku-20241022': '#FFBD9B',
  'claude-3-opus-20240229': '#FFD4C2',
  'gemini-1.5-pro': '#111111',
  'gemini-1.5-flash': '#555555',
  'gemini-2.0-flash': '#888888',
  'o1': '#888888',
  'o1-mini': '#A3A3A3',
  'default': '#CCCCCC'
};
