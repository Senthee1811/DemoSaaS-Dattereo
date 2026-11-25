import { describe, expect, it } from 'vitest';
import { createLatest } from './latest';

describe('createLatest', () => {
  it('the newest request is current; every earlier one is not', () => {
    const l = createLatest();
    const a = l.begin();
    expect(a()).toBe(true);
    const b = l.begin();
    expect(a()).toBe(false);
    expect(b()).toBe(true);
    const c = l.begin();
    expect([a(), b(), c()]).toEqual([false, false, true]);
  });

  it('a slow older response cannot overwrite a newer one (the bug this exists to prevent)', async () => {
    const l = createLatest();
    let shown = 'nothing';
    const load = async (label: string, ms: number) => {
      const current = l.begin();
      await new Promise((r) => setTimeout(r, ms));
      if (current()) shown = label;
    };
    await Promise.all([load('scope A (slow)', 40), load('scope B (fast)', 5)]);
    expect(shown).toBe('scope B (fast)');
  });

  it('instances are independent', () => {
    const x = createLatest();
    const y = createLatest();
    const a = x.begin();
    y.begin();
    y.begin();
    expect(a()).toBe(true);
  });
});
