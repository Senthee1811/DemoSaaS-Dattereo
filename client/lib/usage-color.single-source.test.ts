/**
 * 11.2 guard: the usage color scale lives in lib/usage-color.ts only. This fails if a component
 * grows its own utilization threshold again (the old `utilization >= 80` style conditionals), or
 * stops using getUsageColor/getAlertColor on the surfaces that show utilization.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

describe('single source for usage colors', () => {
  it('no component compares a utilization/percent value against a threshold inline', () => {
    const offenders: string[] = [];
    // `utilization >= 80`, `utilizationPct > 50`, `pct >= 100`, `percent >= 90`, `isWarning =`, `isOverBudget =`
    const inline = /\b(utili[sz]ation\w*|pct|percent\w*)\s*>=?\s*\d+|\b(isWarning|isOverBudget|isExceeded)\s*=/;
    for (const f of files(join(ROOT, 'components')).concat(files(join(ROOT, 'app')))) {
      if (rel(f).startsWith('components/marketing')) continue; // static marketing demo, not product data
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (inline.test(line)) offenders.push(`${rel(f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it.each([
    ['components/projects/ProjectsView.tsx', 'getUsageColor'],
    ['components/dashboard/OverviewView.tsx', 'getUsageColor'],
    ['components/alerts/AlertsView.tsx', 'getAlertColor'],
  ])('%s uses %s', (file, fn) => {
    expect(readFileSync(join(ROOT, file), 'utf8')).toContain(fn);
  });
});
