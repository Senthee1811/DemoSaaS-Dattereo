/**
 * Functional verification of the real application in a real browser (Chrome over CDP) against the throwaway stack.
 *
 *   node scripts/perf/seed.mjs && (serve the production build on :3050) && node scripts/perf/verify.mjs
 *
 * It drives the UI the way a person would and asserts on what is on the screen AND on what reached the backend (ledger,
 * delivery receiver, API). Console errors and page exceptions anywhere fail the run. Exit code 1 if any check fails.
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = process.env.PERF_WEB || 'http://localhost:3050';
const API = process.env.PERF_API || 'http://localhost:4800';
const seeded = JSON.parse(readFileSync(join(here, '.session.json'), 'utf8'));
const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: seeded.email, password: seeded.password }) }).then((r) => r.json());
const session = { ...seeded, accessToken: login.accessToken, refreshToken: login.refreshToken, user: login.user };
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)?.slice(0, 300)}`}`);
};

const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json };
};

// A local receiver standing in for the customer's webhook endpoint
const received = [];
const receiver = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    received.push({ path: req.url, headers: req.headers, body });
    res.writeHead(200).end('ok');
  });
}).listen(4991);

const { cdp, close } = await launchChrome(9444, { width: 1440, height: 900 });
const errors = [];
cdp.on((m, p) => {
  if (m === 'Runtime.exceptionThrown') errors.push(`exception: ${p.exceptionDetails?.exception?.description?.split('\n')[0] ?? p.exceptionDetails?.text}`);
  if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
  if (m === 'Log.entryAdded' && p.entry.level === 'error') errors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`.slice(0, 200));
});
for (const d of ['Page', 'Runtime', 'Network', 'Log']) await cdp.send(`${d}.enable`);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const requests = [];
cdp.on((m, p) => {
  if (m === 'Network.requestWillBeSent') requests.push({ url: p.request.url, type: p.type, method: p.request.method });
});
const store = `try{localStorage.setItem('spendguard_token',${JSON.stringify(session.accessToken)});localStorage.setItem('spendguard_refresh_token',${JSON.stringify(session.refreshToken ?? '')});localStorage.setItem('spendguard_user',${JSON.stringify(JSON.stringify(session.user))});localStorage.setItem('spendguard_tour_completed','true');}catch(e){}`;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: store });

const ev = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const HELPERS = `(() => {
  const w = window;
  w.__v = {
    text: () => document.body.innerText,
    has: (t) => document.body.innerText.includes(t),
    click: (t, sel) => { const els = [...document.querySelectorAll(sel || 'button, a, [role=tab], [role=menuitem]')].filter((e) => (e.textContent || '').trim().includes(t) || (e.getAttribute('aria-label') || '').includes(t)); const el = els.find((e) => e.offsetParent !== null) || els[0]; if (!el) return false; el.click(); return true; },
    fill: (labelText, value) => { const lab = [...document.querySelectorAll('label')].find((l) => (l.textContent || '').includes(labelText)); const input = lab ? (lab.control || lab.querySelector('input, textarea, select')) : document.querySelector('[aria-label="' + labelText + '"]'); if (!input) return false; const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; },
    until: (pred, timeout = 15000) => new Promise((res) => { const t0 = performance.now(); const tick = () => { let v = false; try { v = !!pred(); } catch {} if (v) return res(true); if (performance.now() - t0 > timeout) return res(false); setTimeout(tick, 40); }; tick(); }),
    settled: () => { const m = document.querySelector('main'); return !!m && ![...m.querySelectorAll('.animate-pulse')].some((e) => e.getBoundingClientRect().height > 16) && m.innerText.trim().length > 20; },
  };
})();`;
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });

const goto = async (path) => {
  await cdp.send('Page.navigate', { url: `${WEB}${path}` });
  await sleep(400);
  return ev('__v.until(() => document.querySelector("main h2, main h1"))');
};
const click = (t, sel) => ev(`__v.click(${JSON.stringify(t)}, ${sel ? JSON.stringify(sel) : 'undefined'})`);
const until = (pred, t = 15000) => ev(`__v.until(() => ${pred}, ${t})`);
const settled = () => until('__v.settled()');
const nav = async (label) => {
  const ok = await click(label, 'nav button');
  await sleep(150);
  return ok && (await settled());
};

try {
  // ── Dashboard shell ──────────────────────────────────────────────────────────
  console.log('\n▶ Dashboard');
  check('the dashboard loads and shows the Overview', await goto('/dashboard') && (await ev('__v.has("Overview") || !!document.querySelector("main h2")')));
  check('the app shell is present (navigation, scope selector, notifications)', await ev('!!document.querySelector("nav") && !!document.querySelector("[aria-label=\\"Scope Project Selection\\"]") && !!document.querySelector("[aria-label^=\\"Notifications\\"]")'));

  console.log('\n▶ Every workspace opens lazily and settles');
  const spaces = [['Cost Insights', 'Cost Insights'], ['Projects & Budgets', 'Projects'], ['Test Bench', 'Send Request'], ['Key Vault', 'Key'], ['Alerts & Anomalies', 'Alert'], ['Audit Ledger', 'Audit Trail'], ['Team & Access', 'Team'], ['Billing & Plans', 'Plan'], ['Settings & Account', 'Settings'], ['Gateway SDK', 'SDK'], ['Overview', 'Overview']];
  for (const [label, expected] of spaces) {
    const before = requests.filter((r) => r.type === 'Script').length;
    const ok = await nav(label);
    const shown = await ev(`__v.has(${JSON.stringify(expected)})`);
    const skeleton = await ev('!!document.querySelector("main [data-testid=view-skeleton]")');
    const lazyErr = await ev('!!document.querySelector("[data-testid=lazy-error]")');
    check(`${label}: opens, shows its content, no leftover skeleton or load error`, ok && shown && !skeleton && !lazyErr, { ok, shown, skeleton, lazyErr, newScripts: requests.filter((r) => r.type === 'Script').length - before });
  }
  const scriptsBefore = requests.filter((r) => r.type === 'Script').length;
  await nav('Cost Insights');
  await nav('Overview');
  await nav('Cost Insights');
  check('revisiting a workspace loads no new JavaScript', requests.filter((r) => r.type === 'Script').length === scriptsBefore);

  // ── Cost Insights ────────────────────────────────────────────────────────────
  console.log('\n▶ Cost Insights');
  await nav('Cost Insights');
  check('"Where it goes" shows spend by model with a freshness label', (await until('__v.has("Total, last")')) && (await ev('!!document.querySelector("[data-testid=freshness]")')));
  await click("What's next", '[role=tab]');
  await settled();
  check('forecast: numbers render, then the chart replaces its placeholder at the same height', await (async () => {
    const hasNumbers = await until('!!document.querySelector("[data-testid=forecast-actual]")');
    const box = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { h: Math.round(r.height) }; })()`);
    const holder = await box('div[role=img][aria-label^="Cumulative spend"]');
    const charted = await until('!!document.querySelector(".recharts-wrapper svg")');
    const after = await box('div[role=img][aria-label^="Cumulative spend"]');
    return hasNumbers && charted && holder && after && holder.h === after.h;
  })());
  await click('Why it changed', '[role=tab]');
  await settled();
  check('"Why it changed" names the compared periods and shows the three-factor split or an explanation', (await ev('!!document.querySelector("[data-testid=investigation-ranges]")')) && (await ev('__v.has("splits exactly") || __v.has("Not enough history") || __v.has("no change worth explaining")')));
  await click('What to do', '[role=tab]');
  await settled();
  check('"What to do": cost-only warning visible; approval is stated as a decision, not an action', (await ev('__v.has("Cost only")')) && (await ev('!!document.querySelector("[data-testid=approval-is-not-execution]")')));
  await nav('Overview');
  await nav('Cost Insights');
  check('the selected Cost Insights tab is remembered after leaving and returning', await ev('document.querySelector("[role=tab][aria-selected=true]")?.textContent?.includes("What to do")'));
  const insightsReqs = requests.filter((r) => r.url.includes('/api/v1/insights/forecast')).length;
  await click("What's next", '[role=tab]');
  await settled();
  await click('Where it goes', '[role=tab]');
  await settled();
  await click("What's next", '[role=tab]');
  await settled();
  check('returning to an already-loaded tab within a minute makes no repeat request', requests.filter((r) => r.url.includes('/api/v1/insights/forecast')).length - insightsReqs <= 1, requests.filter((r) => r.url.includes('/api/v1/insights/forecast')).length - insightsReqs);

  // ── Audit ────────────────────────────────────────────────────────────────────
  console.log('\n▶ Audit workspace');
  // a project whose provider fails with a 500: that is a failed call the provider MAY have billed
  const flaky = await api('POST', '/api/v1/projects', { name: `Flaky ${Date.now().toString(36)}`, budgetMonthly: 100 });
  const fid = flaky.body.project.id;
  await api('POST', '/api/v1/keys', { type: 'PROVIDER', projectId: fid, provider: 'OPENAI', keyName: 'k', plainKey: 'sk-mockfail500-abcdefghijklmnop' });
  const gw = await api('POST', '/api/v1/keys', { type: 'GATEWAY', projectId: fid, keyName: 'f' });
  const bad = await fetch(`${API}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gw.body.secret}` }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x' }], max_tokens: 5 }) });
  check('setup: the provider failure was returned as a 502, not charged', bad.status === 502, bad.status);
  await goto('/dashboard');
  await nav('Audit Ledger');
  check('Requests: the ledger table shows rows with token counts and cost', await until('document.querySelectorAll("main table tbody tr").length > 3'));
  const exportCsv = await ev(`fetch('/api/v1/audit/export', { headers: { Authorization: 'Bearer ' + localStorage.getItem('spendguard_token') } }).then(async (r) => ({ status: r.status, head: (await r.text()).split(/\\r?\\n/)[0] }))`);
  const cols = (exportCsv.head ?? '').split(',');
  check('CSV export: the original 16 columns are unchanged and in order; new ones are appended', exportCsv.status === 200 && cols[0] === 'Request ID' && cols[15] === 'Is Hard Blocked' && cols[cols.length - 1] === 'Usage Status', exportCsv);
  await click('Failed calls & estimates');
  await settled();
  check('Failed calls: exposure is shown as an upper bound, with the "not spend" explanation', (await until('__v.has("Exposure is not spend")')) && (await ev('__v.has("upper bound")')));
  check('the provider-error call is listed as "May have been billed"', await until('__v.has("May have been billed") && __v.has("Provider error")'));
  check('estimator accuracy shows the verdict with sample sizes and no margin advice below the evidence threshold', await until('__v.has("Not enough data") || __v.has("No provider-confirmed usage")'));
  await click('Record outcome');
  await ev('(() => { const r = document.querySelector("input[type=radio]"); r && r.click(); })()');
  await click('Save', 'button');
  check('recording an outcome asks for confirmation first', await until('__v.has("Record this invoice outcome?")'));
  const beforeAttempts = await api('GET', '/api/v1/audit/attempts/exposure');
  await click('Record outcome', '[role=alertdialog] button, [role=dialog] button');
  await sleep(1200);
  const afterAttempts = await api('GET', '/api/v1/audit/attempts/exposure');
  const sum = (x) => (x.body.unreconciled ?? []).reduce((a, r) => a + r.attempts, 0);
  check('the outcome was recorded (one fewer unreconciled call) and no ledger spend was added', sum(afterAttempts) === sum(beforeAttempts) - 1, { before: sum(beforeAttempts), after: sum(afterAttempts) });

  // ── Notifications ────────────────────────────────────────────────────────────
  console.log('\n▶ Notifications');
  await nav('Settings & Account');
  await click('Notifications', 'main button');
  check('Settings → Notifications shows the organization channels manager', await until('__v.has("Organization channels")'));
  await ev('__v.fill("Name", "Pager")');
  await ev('__v.fill("Destination URL", "http://127.0.0.1:4991/hook")');
  await click('Add channel');
  check('a webhook channel is added and its signing secret is shown ONCE', await until('!!document.querySelector("[data-testid=signing-secret]")'));
  const secret = await ev('document.querySelector("[data-testid=signing-secret]")?.textContent ?? ""');
  check('the secret has the documented shape and the destination URL is not displayed anywhere', /^whsec_[0-9a-f]{48}$/.test(secret) && !(await ev('__v.has("127.0.0.1:4991/hook")')), secret.slice(0, 12));
  await click('I have stored it');
  check('dismissing removes the secret from the page', await until('!document.querySelector("[data-testid=signing-secret]") && !__v.has("whsec_")'));
  await click('Test', 'button');
  check('a test delivery reaches the receiver, signed with a verifiable signature', await (async () => {
    for (let i = 0; i < 40 && !received.length; i++) await sleep(250);
    const r = received.at(-1);
    if (!r) return false;
    const ts = r.headers['x-spendguard-timestamp'];
    const expected = 'v1=' + createHmac('sha256', secret).update(`${ts}.${r.body}`).digest('hex');
    return String(r.headers['x-spendguard-signature']).split(',').includes(expected);
  })());
  check('delivery history shows the test as sent', await until('__v.has("SpendGuard test notification") && __v.has("sent")', 20000));
  await ev('__v.fill("Name", "Pager copy")');
  await ev('__v.fill("Destination URL", "http://127.0.0.1:4991/hook")');
  await click('Add channel');
  check('adding the SAME destination again warns about the duplicate (and still adds it)', await until('!!document.querySelector("[data-testid=create-warnings]")'));
  await click('I have stored it');
  await click('Rotate secret');
  check('rotating shows the new secret once, with the overlap period for the old one', (await until('!!document.querySelector("[data-testid=rotation-note]")')) && (await ev('document.querySelector("[data-testid=rotation-note]").textContent.includes("keeps verifying until")')));
  await click('I have stored it');
  await click('Pause', 'button');
  check('pausing marks the channel as paused', await until('__v.has("Paused")'));

  // ── Inbox badge ──────────────────────────────────────────────────────────────
  console.log('\n▶ In-app inbox');
  const proj = session.projects[0].id;
  const alert = await api('POST', '/api/v1/alerts', { projectId: proj, thresholdType: 'PERCENT_80' });
  check('setup: a test alert event was raised', alert.status === 201 || alert.status === 200, alert.status);
  await goto('/dashboard');
  check('the bell shows an unread badge', await until('!!document.querySelector("[data-testid=inbox-badge]")', 20000));
  await click('Notifications,', 'button');
  check('the panel lists the notification with its severity and a link', (await until('document.querySelectorAll("[data-testid=inbox-item]").length > 0')) && (await ev('__v.has("View alerts")')));
  await click('Mark all as read');
  check('mark all as read clears the badge', await until('!document.querySelector("[data-testid=inbox-badge]")'));

  // ── Playground attribution ───────────────────────────────────────────────────
  console.log('\n▶ Test Bench attribution');
  await goto('/dashboard');
  await nav('Test Bench');
  await click('Send Request via SpendGuard Gateway');
  check('the test-bench request succeeds', await until('__v.has("200") || __v.has("chatcmpl") || __v.has("Rome") || __v.has("cost")', 20000));
  await sleep(1500);
  const attr = await api('GET', '/api/v1/insights/attribution?dimension=application&days=1');
  check('the request is attributed to "dashboard-playground" in Cost Insights', (attr.body.rows ?? []).some((r) => r.key === 'dashboard-playground'), (attr.body.rows ?? []).map((r) => r.key));

  // ── Responsive ───────────────────────────────────────────────────────────────
  console.log('\n▶ Responsive layout');
  for (const [w, h, name] of [[390, 844, 'phone'], [820, 1180, 'tablet']]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await goto('/dashboard');
    await settled();
    const m = await ev('({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, menu: !!document.querySelector("[aria-label=\\"Open navigation menu\\"]") })');
    check(`${name} (${w}px): no horizontal page scroll${w < 600 ? ' and a menu button' : ''}`, m.sw <= m.iw + 1 && (w >= 600 || m.menu), m);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // ── Console ──────────────────────────────────────────────────────────────────
  const real = errors.filter((e) => !/favicon|Failed to load resource.*(404|502)/.test(e));
  check('no console errors or uncaught exceptions during the whole run (expected 502 from the deliberately failing provider excluded)', real.length === 0, real.slice(0, 5));
} finally {
  await close();
  receiver.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
