/**
 * Repeatable browser measurements of the PRODUCTION build, using Chrome over the DevTools protocol (no dependencies).
 *
 *   1. start a throwaway stack and seed it:   node scripts/perf/seed.mjs
 *   2. build + serve the client:              npx next build --webpack && API_URL=http://localhost:4800 npx next start -p 3050
 *   3. measure:                               node scripts/perf/measure.mjs <label> [runs=5]
 *
 * Each run uses a FRESH Chrome profile with the HTTP cache disabled (a cold first visit), then walks the dashboard the way a
 * user would. Every figure is measured in the browser: nothing is estimated. Results go to scripts/perf/results/<label>.json
 * and a markdown table is printed. Reported numbers are the MEDIAN of the runs (min-max shown).
 *
 * Definitions
 *  - first content: `main h2` (the first workspace heading) is in the DOM
 *  - settled: no skeleton (a pulsing block taller than 16px) left inside <main> for two consecutive frames
 *  - chart ready: a Recharts chart (`.recharts-wrapper svg`) is in the DOM
 *  - navigation time: from the click to "content changed AND settled" (measured inside the page with performance.now())
 *  - JS bytes: sum of encodedDataLength = bytes that crossed the wire (next start gzips responses, so this is the GZIP size)
 *  - PERF_THROTTLE=slow4g adds Lighthouse-style Slow-4G network and 4x CPU throttling
 *  - API requests: XHR/fetch calls to /api/ during the step
 *  - CLS: layout-shift entries without recent input, summed over the step
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LABEL = process.argv[2] || 'run';
const RUNS = Number(process.argv[3] || 5);
const BASE = process.env.PERF_WEB || 'http://localhost:3050';
const THROTTLE = process.env.PERF_THROTTLE === 'slow4g';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const seeded = JSON.parse(readFileSync(join(here, '.session.json'), 'utf8'));
const API = process.env.PERF_API || 'http://localhost:4800';
/** A fresh login for every run: the 15-minute access token (and a rotated refresh token) must never skew a measurement. */
async function freshSession() {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: seeded.email, password: seeded.password }) });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const b = await res.json();
  return { accessToken: b.accessToken, refreshToken: b.refreshToken, user: b.user };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
};

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method) this.handlers.forEach((h) => h(msg.method, msg.params));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(h) {
    this.handlers.push(h);
  }
}

const PAGE_SCRIPT = `
(() => {
  const st = (window.__perf = { cls: 0, longTask: 0, fcp: null, lcp: null, shifts: [] });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { st.cls += e.value; if (e.value > 0.02) st.shifts.push({ at: Math.round(e.startTime), value: +e.value.toFixed(3), what: e.sources.slice(0, 3).map((x) => { const n = x.node; return (n ? n.nodeName + ' "' + (n.textContent || '').trim().slice(0, 24) + '"' : '?') + ' y' + Math.round(x.previousRect.y) + '>' + Math.round(x.currentRect.y); }) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) st.longTask += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') st.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) st.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  st.mainText = () => (document.querySelector('main')?.innerText || '');
  // a skeleton is a pulsing block taller than 16px (the small decorative status dots also pulse)
  st.settled = () => { const m = document.querySelector('main'); return !!m && ![...m.querySelectorAll('.animate-pulse')].some((e) => e.getBoundingClientRect().height > 16) && m.innerText.trim().length > 20; };
  // resolves with ms (performance.now) when pred() has been true for two consecutive frames
  st.until = (pred, timeout = 20000) => new Promise((resolve) => {
    const t0 = performance.now(); let ok = 0;
    const tick = () => {
      let v = false; try { v = !!pred(); } catch {}
      ok = v ? ok + 1 : 0;
      if (ok >= 2) return resolve(performance.now());
      if (performance.now() - t0 > timeout) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
  st.click = (text, sel) => {
    const els = [...document.querySelectorAll(sel || 'button, a, [role=tab]')].filter((e) => (e.textContent || '').trim().includes(text));
    const el = els.find((e) => e.offsetParent !== null) || els[0];
    if (!el) return null;
    el.click();
    return performance.now();
  };
})();`;

async function launch(port) {
  const dir = mkdtempSync(join(tmpdir(), 'sg-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--disable-extensions', '--disable-background-networking', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return { proc, dir, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

async function oneRun(port) {
  const session = await freshSession();
  const { proc, dir, wsUrl } = await launch(port);
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const cdp = new Cdp(ws);
  const reqs = new Map();
  const consoleErrors = [];
  cdp.on((method, p) => {
    if (method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, type: p.type, bytes: 0, done: false, t: Date.now() });
    else if (method === 'Network.loadingFinished' && reqs.has(p.requestId)) Object.assign(reqs.get(p.requestId), { bytes: p.encodedDataLength, done: true });
    else if (method === 'Page.frameNavigated' && !p.frame.parentId) (globalThis.__navs ??= []).push(p.frame.url);
    else if (method === 'Runtime.exceptionThrown') consoleErrors.push(`exception: ${p.exceptionDetails?.exception?.description?.split('\n')[0] ?? p.exceptionDetails?.text}`);
    else if (method === 'Runtime.consoleAPICalled' && p.type === 'error') consoleErrors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
    else if (method === 'Log.entryAdded' && p.entry.level === 'error') consoleErrors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`.slice(0, 200));
  });
  for (const d of ['Page', 'Runtime', 'Network', 'Log', 'Performance']) await cdp.send(`${d}.enable`);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  if (THROTTLE) {
    // Lighthouse's "Slow 4G" network (1.6 Mbit/s down, 750 kbit/s up, 150 ms RTT, with its 0.9 factor) and a 4x slower CPU
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024 / 8) * 0.9, uploadThroughput: (750 * 1024 / 8) * 0.9 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  const storage = `try{localStorage.setItem('spendguard_token',${JSON.stringify(session.accessToken)});localStorage.setItem('spendguard_refresh_token',${JSON.stringify(session.refreshToken ?? '')});localStorage.setItem('spendguard_user',${JSON.stringify(JSON.stringify(session.user))});localStorage.setItem('spendguard_tour_completed','true');}catch(e){}`;
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: storage + PAGE_SCRIPT });

  const evalIn = async (expression, awaitPromise = true) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const counters = async () => {
    const page = await evalIn('({cls: __perf.cls, lt: __perf.longTask})', false);
    const all = [...reqs.values()];
    const done = all.filter((r) => r.done);
    return {
      jsBytes: done.filter((r) => r.type === 'Script').reduce((a, r) => a + r.bytes, 0),
      jsFiles: all.filter((r) => r.type === 'Script').length,
      api: all.filter((r) => ['XHR', 'Fetch'].includes(r.type) && r.url.includes('/api/')).length,
      cls: page.cls,
      lt: page.lt,
    };
  };
  const delta = (a, b) => ({ jsKB: (b.jsBytes - a.jsBytes) / 1024, jsFiles: b.jsFiles - a.jsFiles, api: b.api - a.api, cls: b.cls - a.cls, longTaskMs: b.lt - a.lt });

  const out = {};
  // ── 1. cold dashboard load ──
  const c0 = await counters().catch(() => ({ jsBytes: 0, jsFiles: 0, api: 0, cls: 0, lt: 0 }));
  await cdp.send('Page.navigate', { url: `${BASE}/dashboard` });
  // The first evaluate can land in the about:blank context that Chrome is discarding as /dashboard commits: retry, only here
  const evalAfterNavigate = async (x) => { for (let i = 0; ; i++) { try { return await evalIn(x); } catch (e) { if (i >= 5 || !/navigated or closed|context/i.test(e.message)) throw e; await sleep(150); } } };
  await sleep(300);
  const firstContent = await evalAfterNavigate('__perf.until(() => document.querySelector("main h2"))');
  const settled = await evalIn('__perf.until(() => __perf.settled())');
  const chart = await evalIn('__perf.until(() => document.querySelector(".recharts-wrapper svg"), 20000)');
  await sleep(500);
  const paints = await evalIn('({fcp: __perf.fcp, lcp: __perf.lcp, load: (performance.getEntriesByType("navigation")[0]||{}).loadEventEnd, dcl: (performance.getEntriesByType("navigation")[0]||{}).domContentLoadedEventEnd})', false);
  out['cold: /dashboard (overview)'] = { ...delta(c0, await counters()), firstContentMs: firstContent, settledMs: settled, chartMs: chart, fcpMs: paints.fcp, lcpMs: paints.lcp, loadMs: paints.load, dclMs: paints.dcl };

  // ── 2. navigation steps ──
  const nav = async (name, text, sel) => {
    process.env.PERF_STEP = name;
    if (process.env.PERF_ONLY && !new RegExp(process.env.PERF_ONLY).test(name)) return; // debugging aid: run only the steps that match
    await sleep(300);
    const before = await counters();
    const prev = await evalIn('__perf.mainText()', false);
    const t0 = await evalIn(`__perf.click(${JSON.stringify(text)}, ${sel ? JSON.stringify(sel) : 'undefined'})`, false);
    if (t0 == null) {
      out[name] = { error: `"${text}" not found` };
      return;
    }
    const t = await evalIn(`__perf.until(() => __perf.mainText() !== ${JSON.stringify(prev)} && __perf.settled())`);
    await sleep(400);
    out[name] = { ...delta(before, await counters()), navMs: t == null ? null : t - t0 };
    if (out[name].cls > 0.05) out[name].shifts = await evalIn('__perf.shifts.splice(0)', false);
  };
  await nav('nav: Cost Insights (Where it goes)', 'Cost Insights');
  await nav('tab: Why it changed', 'Why it changed', '[role=tab]');
  await nav("tab: What's next (forecast chart)", "What's next", '[role=tab]');
  await nav('tab: What to do', 'What to do', '[role=tab]');
  await nav('tab: Where it goes (revisit)', 'Where it goes', '[role=tab]');
  await nav('tab: Why it changed (revisit)', 'Why it changed', '[role=tab]');
  await nav('nav: Audit Ledger', 'Audit Ledger');
  await nav('section: Failed calls & estimates', 'Failed calls & estimates');
  await nav('nav: Projects & Budgets', 'Projects & Budgets');
  await nav('nav: Test Bench', 'Test Bench');
  await nav('nav: Settings & Account', 'Settings & Account');
  await nav('nav: Overview (revisit)', 'Overview');
  out.consoleErrors = consoleErrors.filter((e) => !/favicon|404 \(Not Found\)/.test(e));
  ws.close();
  proc.kill();
  await sleep(300);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* profile still locked: leave it in tmp */ }
  return out;
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
  process.stdout.write(`run ${i + 1}/${RUNS}… `);
  try {
    runs.push(await oneRun(9333 + i));
  } catch (e) {
    console.log(`top-level navigations seen: ${(globalThis.__navs ?? []).join(' -> ')}`);
    console.log(`FAILED in step "${process.env.PERF_STEP ?? 'cold load'}": ${e.message}`);
    process.exit(1);
  }
  console.log('done');
}

const keys = Object.keys(runs[0]).filter((k) => k !== 'consoleErrors');
const metrics = ['jsKB', 'jsFiles', 'api', 'cls', 'longTaskMs', 'navMs', 'firstContentMs', 'settledMs', 'chartMs', 'fcpMs', 'lcpMs', 'loadMs'];
const summary = {};
for (const k of keys) {
  summary[k] = {};
  for (const m of metrics) {
    const vals = runs.map((r) => r[k]?.[m]).filter((v) => v != null && Number.isFinite(v));
    if (vals.length) summary[k][m] = { median: median(vals), min: Math.min(...vals), max: Math.max(...vals), n: vals.length };
  }
}
mkdirSync(join(here, 'results'), { recursive: true });
const errors = [...new Set(runs.flatMap((r) => r.consoleErrors))];
writeFileSync(join(here, 'results', `${LABEL}.json`), JSON.stringify({ label: LABEL, runs: RUNS, base: BASE, chrome: CHROME, summary, consoleErrors: errors, raw: runs }, null, 2));

const f = (s, m, d = 0) => (s?.[m] ? s[m].median.toFixed(d) : '–');
console.log(`\n### ${LABEL} (median of ${RUNS} cold runs, production build)\n`);
console.log('| step | JS KB | JS files | API req | nav ms | first content ms | settled ms | chart ms | CLS | long-task ms |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const k of keys) {
  const s = summary[k];
  console.log(`| ${k} | ${f(s, 'jsKB')} | ${f(s, 'jsFiles')} | ${f(s, 'api')} | ${f(s, 'navMs')} | ${f(s, 'firstContentMs')} | ${f(s, 'settledMs')} | ${f(s, 'chartMs')} | ${f(s, 'cls', 3)} | ${f(s, 'longTaskMs')} |`);
}
const cold = summary['cold: /dashboard (overview)'];
console.log(`\ncold load: FCP ${f(cold, 'fcpMs')} ms, LCP ${f(cold, 'lcpMs')} ms, load event ${f(cold, 'loadMs')} ms`);
console.log(`console errors: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`);
