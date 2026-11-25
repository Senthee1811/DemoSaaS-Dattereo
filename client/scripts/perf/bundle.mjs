/**
 * Static bundle report from the real build output (build with `ANALYZE=1 npx next build --webpack`).
 *
 *   node scripts/perf/bundle.mjs [route-entrypoint=app/dashboard/page] [label]
 *
 * Prints, for one route entrypoint, (a) the JS files the browser must fetch BEFORE the route renders, with raw and gzip sizes,
 * and (b) the RENDERED (minified, after tree-shaking) bytes of every module inside those files, grouped by npm package.
 *
 * How (b) is measured, because webpack does not report it: each production chunk is parsed with the TypeScript parser
 * (already a dev dependency); the `webpackChunk.push([[ids], { <module id>: function }])` object is read and each module
 * function's source length is its rendered size. Module ids are mapped to names with client-stats.json. A scope-hoisted
 * ("concatenated") module is split between its members in proportion to their source size. No dependency is added.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const entry = process.argv[2] || 'app/dashboard/page';
const label = process.argv[3] || 'bundle';
const stats = JSON.parse(readFileSync(join(root, '.next', 'analyze', 'client-stats.json'), 'utf8'));

const ep = stats.entrypoints?.[entry];
if (!ep) {
  console.error(`entrypoint "${entry}" not found. Available: ${Object.keys(stats.entrypoints ?? {}).filter((k) => k.startsWith('app/')).join(', ')}`);
  process.exit(1);
}
const assets = (ep.assets ?? []).map((a) => a.name).filter((n) => n.endsWith('.js'));

const files = assets.map((name) => {
  const text = readFileSync(join(root, '.next', name), 'utf8');
  return { name, text, raw: Buffer.byteLength(text), gzip: gzipSync(text).length };
});

// module id -> { name, nested: [{name,size}] }
const byId = new Map();
const collect = (mods) => {
  for (const m of mods ?? []) {
    if (m.id != null && !byId.has(String(m.id))) byId.set(String(m.id), { name: m.name ?? '', nested: m.modules ?? [] });
    if (m.modules?.length) collect(m.modules);
  }
};
collect(stats.modules);
for (const c of stats.chunks ?? []) collect(c.modules);

const pkgOf = (name) => {
  const re = /node_modules\/((?:@[^/]+\/)?[^/]+)/g;
  let last = null, r;
  while ((r = re.exec(name))) last = r[1];
  if (last) return last;
  const m = /^\.\/(app|components|lib)\//.exec(name.replace(/ \+ \d+ modules$/, ''));
  return m ? `app code (${m[1]})` : name.startsWith('webpack/') || name === '' ? 'webpack runtime / other' : 'other';
};

const rendered = new Map();
const add = (pkg, n) => rendered.set(pkg, (rendered.get(pkg) ?? 0) + n);
let unattributed = 0;
for (const f of files) {
  const sf = ts.createSourceFile(f.name, f.text, ts.ScriptTarget.ES2020, false, ts.ScriptKind.JS);
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'push' && node.arguments[0] && ts.isArrayLiteralExpression(node.arguments[0])) {
      const mods = node.arguments[0].elements[1];
      if (mods && ts.isObjectLiteralExpression(mods)) {
        found = true;
        for (const p of mods.properties) {
          const id = p.name && (ts.isNumericLiteral(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null);
          const len = p.getEnd() - p.getStart(sf);
          const info = id != null ? byId.get(String(id)) : null;
          if (!info) { unattributed += len; continue; }
          if (info.nested?.length) {
            const total = info.nested.reduce((a, n) => a + (n.size ?? 0), 0) || 1;
            for (const n of info.nested) add(pkgOf(n.name ?? ''), len * ((n.size ?? 0) / total));
          } else add(pkgOf(info.name), len);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) add('framework / runtime chunks (no module map)', f.raw);
}
if (unattributed) add('unmapped modules', unattributed);

const rows = [...rendered].sort((a, b) => b[1] - a[1]);
const totalRendered = rows.reduce((a, [, n]) => a + n, 0);
const rawTotal = files.reduce((a, f) => a + f.raw, 0);
const gzTotal = files.reduce((a, f) => a + f.gzip, 0);
const md = [
  `### ${label}: JS fetched before \`${entry}\` renders`,
  '',
  `${files.length} files · ${(rawTotal / 1024).toFixed(0)} KB raw · ${(gzTotal / 1024).toFixed(0)} KB gzip`,
  '',
  '| file | raw KB | gzip KB |',
  '|---|---:|---:|',
  ...files.sort((a, b) => b.raw - a.raw).map((f) => `| ${f.name.replace('static/chunks/', '')} | ${(f.raw / 1024).toFixed(0)} | ${(f.gzip / 1024).toFixed(0)} |`),
  '',
  '| package (rendered bytes, minified) | KB | share |',
  '|---|---:|---:|',
  ...rows.slice(0, 22).map(([p, n]) => `| ${p} | ${(n / 1024).toFixed(0)} | ${((n / totalRendered) * 100).toFixed(0)}% |`),
].join('\n');
console.log(md);
mkdirSync(join(here, 'results'), { recursive: true });
writeFileSync(
  join(here, 'results', `${label}-bundle.json`),
  JSON.stringify({ entry, files: files.map((f) => ({ name: f.name, raw: f.raw, gzip: f.gzip })), rawTotal, gzTotal, packages: Object.fromEntries(rows.map(([p, n]) => [p, Math.round(n)])) }, null, 2),
);
