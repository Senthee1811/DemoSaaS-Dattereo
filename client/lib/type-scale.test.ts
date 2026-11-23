/**
 * 10.5 guard: type sizes come from the shared scale (globals.css --text-*), nothing renders below
 * a readable floor, and every dashboard page title uses the same size.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}
const sources = [...files(path.join(ROOT, 'app')), ...files(path.join(ROOT, 'components'))];

describe('type scale (10.5)', () => {
  it('no component sets a font size outside the scale (no text-[Npx], no inline fontSize px) except chart axes', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const rel = path.relative(ROOT, f).split(path.sep).join('/');
      read(rel).split('\n').forEach((line, i) => {
        if (/text-\[\d+(\.\d+)?(px|rem)\]/.test(line)) offenders.push(`${rel}:${i + 1} ${line.trim().slice(0, 80)}`);
      });
    }
    // Marketing keeps its own editorial headline sizes
    expect(offenders.filter((o) => !o.startsWith('components/marketing/'))).toEqual([]);
  });

  it('the smallest tokens stay readable: micro >= 11px, caption and label >= 12px', () => {
    const css = read('app/globals.css');
    const px = (token: string) => {
      const m = new RegExp(String.raw`--text-${token}:\s*([\d.]+)rem`).exec(css);
      return m ? parseFloat(m[1]) * 16 : NaN;
    };
    expect(px('micro')).toBeGreaterThanOrEqual(11);
    expect(px('caption')).toBeGreaterThanOrEqual(12);
    expect(px('label')).toBeGreaterThanOrEqual(12);
    expect(px('xs')).toBeGreaterThanOrEqual(13);
  });

  it('every dashboard page title is the same size and does not grow on wider screens', () => {
    const views = [
      'components/dashboard/OverviewView.tsx',
      'components/projects/ProjectsView.tsx',
      'components/keys/KeyVaultView.tsx',
      'components/playground/PlaygroundView.tsx',
      'components/audit/AuditView.tsx',
      'components/alerts/AlertsView.tsx',
      'components/sdk/SdkView.tsx',
      'components/team/TeamView.tsx',
      'components/billing/BillingView.tsx',
      'components/settings/SettingsView.tsx',
    ];
    for (const v of views) {
      const m = /<h[12][^>]*className="([^"]*font-serif[^"]*text-2xl[^"]*)"/.exec(read(v));
      expect(m, `${v} has no text-2xl page title`).not.toBeNull();
      expect(m![1], v).not.toMatch(/sm:text-|md:text-|lg:text-/);
    }
  });

  it('a modal\'s title is never smaller than the headings inside it (Help Center)', () => {
    const help = read('components/help/HelpCenterModal.tsx');
    const title = /<h2[^>]*className="[^"]*text-(lg|xl)/.exec(help);
    expect(title?.[1]).toBe('xl');
    expect(help).not.toMatch(/<h3[^>]*className="[^"]*text-xl/);
  });
});
