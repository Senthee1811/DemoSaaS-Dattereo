/**
 * 10.4 guard: corner radii come from the shared tokens (globals.css --radius-*), never from a
 * per-component value. Allowed: rounded-full (pills and circles) and rounded-{control,menu,field,card,dialog}
 * (with an optional side: rounded-t-control, rounded-r-field). Anything else, and any px radius, fails.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const sources = [...files(path.join(ROOT, 'app')), ...files(path.join(ROOT, 'components')), ...files(path.join(ROOT, 'lib'))];
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

// a Tailwind radius class: rounded, rounded-xl, rounded-t-lg, rounded-[24px] ...
const CLASS = /(?<![\w-])rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-[a-z0-9]+|-\[[^\]]+\])?(?![\w-])/g;
const ALLOWED = /^rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br))?-(?:full|control|menu|field|card|dialog)$/;

describe('corner radii come from the shared tokens (10.4)', () => {
  it('no component uses a rounded-* class outside the token set', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const text = fs.readFileSync(f, 'utf8');
      text.split('\n').forEach((line, i) => {
        // only look inside strings/templates that look like class lists
        for (const m of line.matchAll(CLASS)) {
          if (!ALLOWED.test(m[0])) offenders.push(`${rel(f)}:${i + 1} ${m[0]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('no component sets a radius in px (inline style or CSS)', () => {
    const offenders: string[] = [];
    for (const f of sources) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/borderRadius:\s*['"`]?\d+(px|rem)/.test(line) || /border-radius:\s*\d+px/.test(line)) offenders.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('globals.css defines every radius token and uses var(--radius-*) for its own cards', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    for (const t of ['control', 'menu', 'field', 'card', 'dialog']) expect(css).toContain(`--radius-${t}:`);
    expect(css).not.toMatch(/border-radius:\s*(?!var\(|9999px)[0-9]/);
  });
});
