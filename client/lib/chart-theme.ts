'use client';

import { useSyncExternalStore } from 'react';

/** Chart colours resolved from the design tokens in globals.css (--sg-chart-*). */
export interface ChartTheme {
  axis: string;
  grid: string;
  line: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipFg: string;
  accent: string;
}

const LIGHT: ChartTheme = {
  axis: '#80868B',
  grid: '#ECECE8',
  line: '#E4E4E0',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E4E4E0',
  tooltipFg: '#141413',
  accent: '#FF6B35',
};

function read(): ChartTheme {
  if (typeof document === 'undefined') return LIGHT;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    axis: v('--sg-chart-axis', LIGHT.axis),
    grid: v('--sg-chart-grid', LIGHT.grid),
    line: v('--sg-line', LIGHT.line),
    tooltipBg: v('--sg-chart-tooltip-bg', LIGHT.tooltipBg),
    tooltipBorder: v('--sg-chart-tooltip-border', LIGHT.tooltipBorder),
    tooltipFg: v('--sg-chart-tooltip-fg', LIGHT.tooltipFg),
    accent: v('--sg-accent', LIGHT.accent),
  };
}

// Cache by theme class so getSnapshot returns a stable object between changes.
let cachedKey = '';
let cached: ChartTheme = LIGHT;
function snapshot(): ChartTheme {
  const key = typeof document === 'undefined' ? '' : document.documentElement.className;
  if (key !== cachedKey) {
    cachedKey = key;
    cached = read();
  }
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/**
 * Recharts sets SVG presentation attributes, which cannot use CSS variables reliably,
 * so charts read the resolved token values and re-render when the theme class changes.
 */
export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, snapshot, () => LIGHT);
}
