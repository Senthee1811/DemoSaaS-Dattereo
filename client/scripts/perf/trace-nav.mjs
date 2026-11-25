/**
 * Traces ONE workspace navigation event by event: when the click happened, when its chunk was requested/finished, when the
 * skeleton appeared and when the real content did. Use it to see where a navigation's time goes.
 *
 *   node scripts/perf/trace-nav.mjs "Audit Ledger" [hoverMs=0]
 *
 * hoverMs > 0 first moves the real mouse pointer over the item for that long (what a person does before clicking), which is what
 * triggers the intent-based prefetch.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.PERF_WEB || 'http://localhost:3050';
const API = process.env.PERF_API || 'http://localhost:4800';
const label = process.argv[2] || 'Audit Ledger';
const hoverMs = Number(process.argv[3] || 0);
const seeded = JSON.parse(readFileSync(join(here, '.session.json'), 'utf8'));
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: seeded.email, password: seeded.password }) }).then((r) => r.json());

const { cdp, close } = await launchChrome(9555);
const net = new Map();
cdp.on((m, p) => {
  if (m === 'Network.requestWillBeSent' && p.type === 'Script') net.set(p.requestId, { url: p.request.url.split('/').pop(), start: p.timestamp });
  if (m === 'Network.loadingFinished' && net.has(p.requestId)) net.get(p.requestId).end = p.timestamp;
});
for (const d of ['Page', 'Runtime', 'Network']) await cdp.send(`${d}.enable`);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const storage = `localStorage.setItem('spendguard_token',${JSON.stringify(login.accessToken)});localStorage.setItem('spendguard_refresh_token',${JSON.stringify(login.refreshToken)});localStorage.setItem('spendguard_user',${JSON.stringify(JSON.stringify(login.user))});localStorage.setItem('spendguard_tour_completed','true');`;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: storage });
const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

await cdp.send('Page.navigate', { url: `${WEB}/dashboard` });
await ev('new Promise(r => { const t = () => document.querySelector("main h2") ? r(true) : setTimeout(t, 30); t(); })');
await sleep(1500); // let the dashboard settle completely

const rect = await ev(`(() => { const b = [...document.querySelectorAll('nav button')].find((x) => x.textContent.includes(${JSON.stringify(label)})); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (hoverMs > 0) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await sleep(hoverMs);
}
// one in-page recorder: frame-accurate times for click, first skeleton, first real content
const trace = await ev(`new Promise((resolve) => {
  const out = { skeletonAt: null, contentAt: null };
  const btn = [...document.querySelectorAll('nav button')].find((x) => x.textContent.includes(${JSON.stringify(label)}));
  const before = document.querySelector('main').innerText;
  const clickedAt = performance.now();
  out.clickAt = 0;
  btn.click();
  const tick = () => {
    const now = performance.now() - clickedAt;
    const m = document.querySelector('main');
    if (out.skeletonAt === null && m && m.querySelector('[data-testid=view-skeleton]')) out.skeletonAt = now;
    const settled = m && ![...m.querySelectorAll('.animate-pulse')].some((e) => e.getBoundingClientRect().height > 16) && m.innerText !== before && m.innerText.trim().length > 20;
    if (out.contentAt === null && settled) { out.contentAt = now; return resolve(out); }
    if (now > 10000) return resolve(out);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})`);
await sleep(300);
console.log(`navigation to "${label}" (hover before click: ${hoverMs} ms)`);
console.log(`  skeleton visible at   ${trace.skeletonAt === null ? 'never (content was ready on the first frame)' : trace.skeletonAt.toFixed(0) + ' ms'}`);
console.log(`  real content settled  ${trace.contentAt === null ? 'not within 10 s' : trace.contentAt.toFixed(0) + ' ms'} after the click`);
const scripts = [...net.values()].filter((s) => s.start && s.end);
console.log('  most recent JavaScript requests (download time only):');
const late = scripts.slice(-6);
for (const s of late) console.log(`    ${s.url.padEnd(34)} request→done ${((s.end - s.start) * 1000).toFixed(0)} ms`);
await close();
