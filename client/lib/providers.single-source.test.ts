/**
 * 9.1 guard: a provider is defined in lib/providers.ts and nowhere else on the frontend.
 * This fails the build if someone hardcodes a provider id or a provider list in a component,
 * which is exactly how adding a provider used to mean editing six files.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d))).filter((f) => {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  return rel !== 'lib/providers.ts';
});
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

describe('the provider registry is the only definition of a provider', () => {
  it('no provider id literal (\'OPENAI\', \'GROQ\', ...) appears outside lib/providers.ts', () => {
    const offenders = files.filter((f) => /['"`](OPENAI|ANTHROPIC|GEMINI|GROQ|CLAUDE)['"`]/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no component imports provider icons directly (logos come from the registry through ProviderLogo)', () => {
    const offenders = files.filter((f) => /from 'simple-icons'/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no in-app text hardcodes a list of providers (it uses providerNames()); marketing and SEO metadata are prose and exempt', () => {
    const list = /OpenAI,\s*(Anthropic|Claude)/;
    const offenders = files
      .filter((f) => !rel(f).startsWith('components/marketing/') && rel(f) !== 'app/layout.tsx')
      .filter((f) => list.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it('no component keeps its own provider-specific key placeholder or model-prefix branch', () => {
    const offenders = files
      .filter((f) => /'sk-proj-\.\.\.'|'sk-ant-api03|'gsk_\.\.\.'|startsWith\('(claude|gemini|gpt)'\)/.test(fs.readFileSync(f, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
