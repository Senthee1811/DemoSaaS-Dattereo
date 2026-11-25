/**
 * Lists the layout shifts caused by opening one workspace: when, how big, and which elements moved.
 *   node scripts/perf/trace-cls.mjs "Test Bench"
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.PERF_WEB || 'http://localhost:3050';
const API = process.env.PERF_API || 'http://localhost:4800';
const label = process.argv[2] || 'Test Bench';
const before = process.argv[3]; // optional workspace to open first
const seeded = JSON.parse(readFileSync(join(here, '.session.json'), 'utf8'));
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: seeded.email, password: seeded.password }) }).then((r) => r.json());
const { cdp, close } = await launchChrome(9556, { width: 1440, height: 900 });
for (const d of ['Page', 'Runtime']) await cdp.send(`${d}.enable`);
const storage = `localStorage.setItem('spendguard_token',${JSON.stringify(login.accessToken)});localStorage.setItem('spendguard_refresh_token',${JSON.stringify(login.refreshToken)});localStorage.setItem('spendguard_user',${JSON.stringify(JSON.stringify(login.user))});localStorage.setItem('spendguard_tour_completed','true');
window.__shifts=[];new PerformanceObserver((l)=>{for(const e of l.getEntries()){if(e.hadRecentInput)continue;window.__shifts.push({at:Math.round(e.startTime),value:+e.value.toFixed(3),nodes:e.sources.map((s)=>{const n=s.node;return (n?(n.nodeName+(n.className&&typeof n.className==='string'?'.'+n.className.split(' ').slice(0,3).join('.'):'')+' "'+(n.textContent||'').trim().slice(0,30)+'"'):'?')+' '+Math.round(s.previousRect.y)+'→'+Math.round(s.currentRect.y)+' h'+Math.round(s.previousRect.height)+'→'+Math.round(s.currentRect.height)})})}}).observe({type:'layout-shift',buffered:true});`;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: storage });
const ev = async (expression) => (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
await cdp.send('Page.navigate', { url: `${WEB}/dashboard` });
await sleep(500);
for (let i = 0; i < 100 && !(await ev('!!document.querySelector("main h2")')); i++) await sleep(100);
await sleep(1500);
for (const step of (before || '').split(',').filter(Boolean)) {
  await ev(`[...document.querySelectorAll('nav button')].find((x) => x.textContent.includes(${JSON.stringify(step)})).click()`);
  await sleep(Number(process.env.GAP_MS || 700));
}
await ev('window.__shifts.length=0');
await ev(`[...document.querySelectorAll(${JSON.stringify(process.env.SEL || 'nav button')})].find((x) => x.textContent.includes(${JSON.stringify(label)}) && x.offsetParent !== null).click()`);
await sleep(2500);
console.log(JSON.stringify(await ev('window.__shifts'), null, 1));
if (process.env.MEASURE_SEL) console.log('height of the block after the label', process.env.MEASURE_SEL, '=', await ev(`(() => { const l = [...document.querySelectorAll('label, span, h3')].find((x) => x.textContent.trim() === ${JSON.stringify(process.env.MEASURE_SEL)}); const b = l && (l.tagName === 'LABEL' ? l.parentElement.lastElementChild : null); return b ? Math.round(b.getBoundingClientRect().height) : 'not found'; })()`));
await close();
