import { describe, expect, it } from 'vitest';
import { getAlertColor, getUsageColor, getUsageLevel, parseWarningPercent } from './usage-color';

describe('getUsageColor: Safe below 50, Warning 50-99, Critical at 100 and over', () => {
  it.each([
    [0, 'safe'],
    [49, 'safe'],
    [49.99, 'safe'],
    [50, 'warning'],
    [60, 'warning'],
    [99, 'warning'],
    [99.6, 'warning'], // must not turn red by rounding to 100
    [100, 'critical'],
    [250, 'critical'],
  ])('%s%% is %s', (pct, level) => expect(getUsageLevel(pct)).toBe(level));

  it('a hard-blocked project is always critical, whatever its percentage', () => {
    expect(getUsageColor(10, { blocked: true }).level).toBe('critical');
  });

  it('is safe for nonsense input instead of throwing', () => {
    expect(getUsageLevel(Number.NaN)).toBe('safe');
  });

  it('uses the semantic tokens that follow dark mode', () => {
    expect(getUsageColor(10).bar).toBe('bg-success');
    expect(getUsageColor(60).bar).toBe('bg-warning');
    expect(getUsageColor(100).bar).toBe('bg-critical');
  });

  it('puts alert types on the same scale: 80% warning is amber, hard-block is red', () => {
    expect(getAlertColor('PERCENT_80').level).toBe('warning');
    expect(getAlertColor('ANOMALY_DETECTED').level).toBe('warning');
    expect(getAlertColor('HARD_BLOCK').level).toBe('critical');
  });
});

describe('the warning boundary is configurable without a code change', () => {
  it('accepts 1-99 and falls back to 50 for anything else', () => {
    expect(parseWarningPercent('75')).toBe(75);
    expect(parseWarningPercent(undefined)).toBe(50);
    expect(parseWarningPercent('')).toBe(50);
    expect(parseWarningPercent('abc')).toBe(50);
    expect(parseWarningPercent('0')).toBe(50);
    expect(parseWarningPercent('100')).toBe(50);
  });
});
