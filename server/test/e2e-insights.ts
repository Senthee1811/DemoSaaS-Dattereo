/**
 * SpendGuard live financial-intelligence suite (companion to e2e-scenarios.ts / e2e-reliability.ts).
 *
 * Seeds a ledger with KNOWN values directly in Postgres, then asserts the HTTP API's numbers against hand-computed
 * figures and against independent prisma aggregates. This is what exercises the raw SQL (date_trunc buckets,
 * percentile_cont, groupBy, org joins) that unit tests with fakes cannot. It also drives the notification path
 * end to end with a real signed-webhook receiver.
 *
 * Seeded history for project "Alpha" (relative to now):
 *   days 1..14 ago  : 50 requests/day, gpt-4o-mini, app "chat",   1000 in + 200 out tokens, $0.20 each  = $10.00/day
 *   last 6 hours    : 100 requests,    gpt-4o,      app "docsum", 4000 in + 500 out tokens, $0.50 each  = $50.00
 *   old, untagged   : 20 requests,     gpt-4o-mini, no tags,      $0.10 each                            = $2.00
 *   blocked         : 30 requests (isBlocked) with large cost — must never count as spend
 *   other tenant    : project "Beta" in another org with $9,999 of spend — must never appear
 *
 * Usage (backend with NOTIFICATION_ALLOW_HTTP=true NOTIFICATION_ALLOW_PRIVATE_NETWORKS=true so the local receiver is allowed):
 *   E2E_BASE_URL=http://localhost:4000 E2E_MOCK_URL=http://localhost:4555 DATABASE_URL=... npm run test:e2e:insights
 */
import { createServer, IncomingMessage } from 'http';
import { PrismaClient } from '@prisma/client';
import { verifyWebhook } from '../src/modules/notifications/signing';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? `\n      → ${JSON.stringify(detail).slice(0, 600)}` : ''}`);
  }
}
const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) <= eps;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | undefined | false>, timeoutMs = 40000, everyMs = 400): Promise<T | undefined> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await sleep(everyMs);
  }
  return undefined;
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain */
  }
  return { status: res.status, body, text, headers: res.headers };
}

async function register(name: string) {
  const email = `${name.toLowerCase()}.${RUN}@e2e.spendguard.test`;
  const res = await api('POST', '/auth/register', { body: { email, password: 'CorrectHorse!42', name, orgName: `${name} Org ${RUN}` } });
  return { token: res.body.accessToken as string, orgId: res.body.user.orgId as string, status: res.status };
}

/** Receives webhooks like a customer's server would. */
function startReceiver() {
  const received: Array<{ path: string; headers: IncomingMessage['headers']; body: string }> = [];
  let flakyHits = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body });
      if (req.url === '/gone') return void res.writeHead(404).end();
      if (req.url === '/flaky' && ++flakyHits === 1) return void res.writeHead(500).end();
      res.writeHead(200).end('ok');
    });
  });
  return new Promise<{ url: string; received: typeof received; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as any).port}`, received, close: () => server.close() })),
  );
}

async function run() {
  console.log(`\nSpendGuard live financial-intelligence E2E against ${BASE} (run ${RUN})\n`);
  const prisma = new PrismaClient();
  const now = Date.now();

  const alice = await register('Alice');
  const bob = await register('Bob');
  check('two organizations registered', alice.status === 201 && bob.status === 201 && alice.orgId !== bob.orgId);

  const proj = (await api('POST', '/api/v1/projects', { token: alice.token, body: { name: `Alpha ${RUN}`, budgetMonthly: 1000 } })).body.project;
  const projB = (await api('POST', '/api/v1/projects', { token: bob.token, body: { name: `Beta ${RUN}`, budgetMonthly: 100 } })).body.project;
  const keyRes = await api('POST', '/api/v1/keys', { token: alice.token, body: { type: 'GATEWAY', projectId: proj.id, keyName: 'Prod key' } });
  const keyId = keyRes.body.id as string;

  // ── Seed the ledger ──────────────────────────────────────────────────────
  const row = (id: string, projectId: string, createdAt: Date, m: any) => ({
    id: `req_${RUN}_${id}`, projectId, provider: 'OPENAI' as const, model: m.model, tokensIn: m.tin, tokensOut: m.tout, totalTokens: m.tin + m.tout,
    costEstimate: m.cost, latencyMs: 100, statusCode: 200, isBlocked: m.blocked ?? false, anomalyStatus: m.blocked ? 'SKIPPED' : 'CLEAR',
    application: m.app ?? null, team: m.team ?? null, gatewayKeyId: m.key ?? null, createdAt,
  });
  const data: any[] = [];
  for (let d = 1; d <= 14; d++) for (let i = 0; i < 50; i++) data.push(row(`h${d}_${i}`, proj.id, new Date(now - d * DAY - 3 * HOUR + i * 1000), { model: 'gpt-4o-mini', tin: 1000, tout: 200, cost: 0.2, app: 'chat', team: 'support', key: keyId }));
  for (let i = 0; i < 100; i++) data.push(row(`s_${i}`, proj.id, new Date(now - (1 + (i % 5)) * HOUR - i * 1000), { model: 'gpt-4o', tin: 4000, tout: 500, cost: 0.5, app: 'docsum', team: 'platform', key: keyId }));
  for (let i = 0; i < 20; i++) data.push(row(`u_${i}`, proj.id, new Date(now - 9 * DAY - 5 * HOUR + i * 1000), { model: 'gpt-4o-mini', tin: 500, tout: 100, cost: 0.1 }));
  for (let i = 0; i < 30; i++) data.push(row(`b_${i}`, proj.id, new Date(now - 2 * HOUR - i * 1000), { model: 'gpt-4o', tin: 9000, tout: 0, cost: 0, blocked: true }));
  for (let i = 0; i < 100; i++) data.push(row(`o_${i}`, projB.id, new Date(now - 2 * HOUR - i * 1000), { model: 'gpt-4o', tin: 4000, tout: 500, cost: 99.99, app: 'secret-app' }));
  await prisma.request.createMany({ data });
  const REAL_TOTAL = 14 * 10 + 50 + 2; // 192

  // ── Attribution ──────────────────────────────────────────────────────────
  console.log('▶ Attribution: where the money goes');
  const byModel = await api('GET', `/api/v1/insights/attribution?dimension=model&projectId=${proj.id}`, { token: alice.token });
  const rows = Object.fromEntries((byModel.body.rows as any[]).map((r) => [r.label, r]));
  check('spend by model matches the hand-computed ledger ($142 mini, $50 gpt-4o); blocked rows are not spend', byModel.status === 200 && near(rows['gpt-4o-mini'].costUsd, 142) && near(rows['gpt-4o'].costUsd, 50), byModel.body.rows);
  check('total equals an independent prisma aggregate of the same ledger', near(byModel.body.totals.costUsd, REAL_TOTAL) && near(byModel.body.totals.costUsd, Number((await prisma.request.aggregate({ where: { projectId: proj.id, isBlocked: false }, _sum: { costEstimate: true } }))._sum.costEstimate)), byModel.body.totals);
  check('request and token counts are exact', rows['gpt-4o'].requests === 100 && rows['gpt-4o'].tokensPerRequest === 4500 && rows['gpt-4o-mini'].requests === 720, rows);
  check('shares add up', near((byModel.body.rows as any[]).reduce((a, r) => a + r.share, 0), 1, 0.001));

  const byApp = await api('GET', `/api/v1/insights/attribution?dimension=application&projectId=${proj.id}`, { token: alice.token });
  const apps = Object.fromEntries((byApp.body.rows as any[]).map((r) => [r.label, r]));
  check('application: tagged spend is exact and untagged spend is its OWN "Unattributed" row', near(apps.chat.costUsd, 140) && near(apps.docsum.costUsd, 50) && apps.Unattributed.unattributed === true && near(apps.Unattributed.costUsd, 2), byApp.body.rows);
  check('coverage reports the unattributed share and explains how to attribute', near(byApp.body.coverage.attributedShare, 190 / 192, 0.001) && !!byApp.body.howToAttribute?.keyLevel, byApp.body.coverage);

  const byKey = await api('GET', `/api/v1/insights/attribution?dimension=key&projectId=${proj.id}`, { token: alice.token });
  check('key: the key is named, and rows without a key say so', (byKey.body.rows as any[]).some((r) => /Prod key/.test(r.label) && near(r.costUsd, 190)) && (byKey.body.rows as any[]).some((r) => r.unattributed), byKey.body.rows);
  const byProject = await api('GET', '/api/v1/insights/attribution?dimension=project', { token: alice.token });
  check('org-wide by project shows only alice\'s own project, never bob\'s $9,999', byProject.body.rows.length === 1 && near(byProject.body.totals.costUsd, REAL_TOTAL) && !byProject.text.includes(projB.id), byProject.body.rows);
  const week = await api('GET', `/api/v1/insights/attribution?dimension=model&projectId=${proj.id}&days=7`, { token: alice.token });
  check('the relative window the UI uses (days=7) covers only the last 7 days: $110 (6 days of $10 + the $50 spike), not the whole history', week.status === 200 && near(week.body.totals.costUsd, 110, 0.5) , week.body.totals);
  check('a bad relative window is a 400, never silently clamped', (await api('GET', '/api/v1/insights/attribution?dimension=model&days=0', { token: alice.token })).status === 400 && (await api('GET', '/api/v1/insights/attribution?dimension=model&days=abc', { token: alice.token })).status === 400 && (await api('GET', '/api/v1/insights/investigation?hours=0', { token: alice.token })).status === 400);
  const badDim = await api('GET', '/api/v1/insights/attribution?dimension=password_hash', { token: alice.token });
  check('unknown dimensions are rejected (400)', badDim.status === 400, badDim.status);

  // ── Tenant isolation ─────────────────────────────────────────────────────
  console.log('\n▶ Isolation');
  const bobView = await api('GET', '/api/v1/insights/attribution?dimension=model', { token: bob.token });
  check('bob sees only his own spend ($9,999), not alice\'s', near(bobView.body.totals.costUsd, 9999) && !bobView.text.includes('docsum'), bobView.body.totals);
  const probes = await Promise.all(
    ['attribution?dimension=model', 'forecast', 'investigation', 'model-comparison'].map((p) => api('GET', `/api/v1/insights/${p}${p.includes('?') ? '&' : '?'}projectId=${proj.id}`, { token: bob.token })),
  );
  check('bob naming alice\'s project gets 404 from every insight endpoint', probes.every((p) => p.status === 404), probes.map((p) => p.status));
  const anon = await api('GET', '/api/v1/insights/forecast');
  check('insights require authentication', anon.status === 401, anon.status);

  // ── Investigation ────────────────────────────────────────────────────────
  console.log('\n▶ Investigation: what changed, when, why');
  const inv = await api('GET', `/api/v1/insights/investigation?projectId=${proj.id}`, { token: alice.token });
  const d = inv.body.decomposition;
  check('window $50 vs baseline $10/day: +$40 (5×)', inv.status === 200 && d.status === 'ok' && near(d.windowSpendUsd, 50) && near(d.baselineSpendUsd, 10, 0.05) && near(d.deltaUsd, 40, 0.05), d);
  const e = d.effects;
  check('the three effects sum EXACTLY to the change', near(e.requestVolume + e.tokensPerRequest + e.pricePerToken, d.deltaUsd, 0.001), e);
  check('hand-computed: volume +$10, tokens per request +$55, price per token −$25 → dominant = tokens per request', near(e.requestVolume, 10, 0.2) && near(e.tokensPerRequest, 55, 0.5) && near(e.pricePerToken, -25, 0.5) && d.dominant === 'tokensPerRequest', e);
  const modelContrib = inv.body.contributors.model[0];
  check('gpt-4o is the top contributor, new in the window, +$50', modelContrib.key === 'gpt-4o' && modelContrib.isNew === true && near(modelContrib.deltaUsd, 50, 0.05), modelContrib);
  check('application "docsum" is identified as a contributor too', inv.body.contributors.application[0].key === 'docsum', inv.body.contributors.application);
  const invHours = await api('GET', `/api/v1/insights/investigation?projectId=${proj.id}&hours=24`, { token: alice.token });
  check('the relative window the UI uses (hours=24) gives the same analysis as the default', invHours.status === 200 && near(invHours.body.decomposition.windowSpendUsd, 50, 0.05), invHours.body.decomposition);
  const cp = inv.body.changePoint;
  check('the change point is in the last ~6 hours (where the spike was seeded)', !!cp && new Date(cp.startedAt).getTime() >= now - 7 * HOUR && new Date(cp.startedAt).getTime() <= now, cp);
  check('history: higher than every earlier day, 5× the median day', inv.body.historical.percentileRank === 1 && inv.body.historical.multipleOfMedian >= 4.9, inv.body.historical);

  const evidenceIds: string[] = [...(inv.body.evidence.topRequests as any[]).map((r) => r.id), ...(inv.body.evidence.byContributor as any[]).flatMap((c) => c.requests.map((r: any) => r.id)), ...(inv.body.explanations as any[]).flatMap((x) => x.evidence.requestIds)];
  const found = await prisma.request.findMany({ where: { id: { in: [...new Set(evidenceIds)] } }, select: { id: true, projectId: true, isBlocked: true } });
  check('EVERY evidence request id is a real ledger row of this project (and none is a blocked row)', evidenceIds.length > 0 && found.length === new Set(evidenceIds).size && found.every((r) => r.projectId === proj.id && !r.isBlocked), { ids: evidenceIds.length, found: found.length });
  check('explanations are present, each with a basis', inv.body.explanations.length >= 4 && inv.body.explanations.every((x: any) => x.evidence.basis), inv.body.explanations.map((x: any) => x.id));
  check('no request content in the response (no previews, prompts, IPs)', !/promptPreview|responsePreview|clientIp|prompt/i.test(inv.text), inv.text.slice(0, 200));
  const win = await api('GET', `/api/v1/insights/investigation?projectId=${proj.id}&from=${new Date(now - 40 * DAY).toISOString()}&to=${new Date(now - 39 * DAY).toISOString()}`, { token: alice.token });
  check('a window with no spend says so (no invented change)', win.status === 200 && win.body.explanations[0].text === 'There was no spend in this window.', win.body.explanations);
  check('a window under 1 hour is rejected', (await api('GET', `/api/v1/insights/investigation?from=${new Date(now - 600_000).toISOString()}&to=${new Date(now).toISOString()}`, { token: alice.token })).status === 400);

  // ── Forecast ─────────────────────────────────────────────────────────────
  console.log('\n▶ Forecast');
  const fc = await api('GET', `/api/v1/insights/forecast?projectId=${proj.id}`, { token: alice.token });
  const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1));
  const mtd = Number((await prisma.request.aggregate({ where: { projectId: proj.id, isBlocked: false, createdAt: { gte: monthStart } }, _sum: { costEstimate: true } }))._sum.costEstimate ?? 0);
  check('month-to-date ACTUAL equals an independent aggregate of this month\'s ledger', fc.status === 200 && near(fc.body.actual.monthToDateUsd, mtd, 0.001), { api: fc.body.actual.monthToDateUsd, db: mtd });
  check('actual and forecast are separate blocks; the projection exists only with ≥3 observed days', (fc.body.actual.observedDays >= 3) === (fc.body.forecast !== null) && fc.body.sufficiency !== undefined && typeof fc.body.method === 'string', { observed: fc.body.actual.observedDays, forecast: fc.body.forecast });
  if (fc.body.forecast) {
    const f = fc.body.forecast;
    check('range brackets the projection and never goes below spend already incurred', f.lowUsd <= f.projectedMonthEndUsd && f.projectedMonthEndUsd <= f.highUsd && f.lowUsd >= fc.body.actual.monthToDateUsd - 1e-6, f);
    check('every series point is labelled actual or forecast', fc.body.days.every((x: any) => x.kind === 'actual' || x.kind === 'forecast') && fc.body.days.some((x: any) => x.kind === 'forecast' || fc.body.days.length > 0));
  } else {
    check('with too little history, no projection is shown and the reason is stated', /at least 3/.test(fc.body.sufficiencyNote), fc.body.sufficiencyNote);
  }
  check('budget block uses the project budget', fc.body.budget?.budgetUsd === 1000, fc.body.budget);
  const orgFc = await api('GET', '/api/v1/insights/forecast', { token: alice.token });
  check('org-wide forecast budget is the sum of the org\'s project budgets (alice: $1000)', orgFc.body.budget?.budgetUsd === 1000 && orgFc.body.scope.budgetScope === 'organization', orgFc.body.budget);

  // ── Model comparison ─────────────────────────────────────────────────────
  console.log('\n▶ Model comparison');
  const cmp = await api('GET', `/api/v1/insights/model-comparison?projectId=${proj.id}&days=30`, { token: alice.token });
  const g4o = cmp.body.sources.find((s: any) => s.usage.model === 'gpt-4o');
  check('historical token distribution is exact (4000 in / 500 out for every gpt-4o request)', g4o.usage.requests === 100 && g4o.distribution.input.avg === 4000 && g4o.distribution.input.p95 === 4000 && g4o.distribution.output.max === 500, g4o.distribution);
  const mini = g4o.comparisons.find((c: any) => c.candidate.model === 'gpt-4o-mini');
  check('hand-computed: 400,000 in + 50,000 out on gpt-4o-mini = $0.09, vs $50 actual', near(mini.hypotheticalUsd.low, 0.09, 1e-5) && near(mini.savingsUsd.low, 49.91, 1e-3), mini);
  check('every comparison is cost-only, "not_assessed" quality, and requires human approval', cmp.body.sources.every((s: any) => s.comparisons.every((c: any) => c.qualityEquivalence === 'not_assessed' && c.requiresHumanApproval === true)) && /cost only/.test(cmp.body.disclaimer));
  check('compatibility checks are present (context window / provider key / lifecycle)', mini.checks.map((c: any) => c.id).sort().join() === 'context_window,lifecycle,provider_key', mini.checks);

  // ── Attribution at the gateway (key precedence) ──────────────────────────
  console.log('\n▶ Gateway attribution');
  const keyed = await api('POST', '/api/v1/keys', { token: alice.token, body: { type: 'GATEWAY', projectId: proj.id, keyName: 'Team key', team: 'Platform' } });
  check('a key can carry a team (normalised to lower case) and lists it', keyed.status === 201 && (await api('GET', '/api/v1/keys', { token: alice.token })).body.gatewayKeys.some((k: any) => k.id === keyed.body.id && k.team === 'platform'));
  await api('POST', '/api/v1/keys', { token: alice.token, body: { type: 'PROVIDER', projectId: proj.id, provider: 'OPENAI', keyName: 'k', plainKey: 'sk-goodkey-abcdefghijklmnop' } });
  const call = await api('POST', '/v1/chat/completions', {
    token: keyed.body.secret, headers: { 'X-SpendGuard-Team': 'Finance', 'X-SpendGuard-Application': 'Billing-API', 'X-SpendGuard-Tags': 'env=prod,Region=EU,team=x' },
    body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 20 },
  });
  const ledgerRow = await prisma.request.findFirst({ where: { projectId: proj.id, id: `req_${String(call.body.id).replace('chatcmpl-req_', '')}` } });
  check('the request succeeded and was attributed: key team wins, header application accepted, tags kept', call.status === 200 && ledgerRow?.team === 'platform' && ledgerRow?.application === 'billing-api' && JSON.stringify(ledgerRow?.tags) === JSON.stringify({ env: 'prod', region: 'eu' }), { status: call.status, ledgerRow: ledgerRow && { team: ledgerRow.team, application: ledgerRow.application, tags: ledgerRow.tags } });
  check('the ignored header is reported to the caller, never silently dropped', /team header ignored/.test(call.headers.get('x-spendguard-attribution-ignored') ?? ''), call.headers.get('x-spendguard-attribution-ignored'));
  const plain = await api('POST', '/v1/chat/completions', { token: keyRes.body.secret, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], max_tokens: 20 } });
  const plainRow = await prisma.request.findFirst({ where: { projectId: proj.id, id: `req_${String(plain.body.id).replace('chatcmpl-req_', '')}` } });
  check('with no key assignment and no headers the row stays UNATTRIBUTED (nothing guessed)', plain.status === 200 && plainRow?.application === null && plainRow?.team === null, plainRow && { a: plainRow.application, t: plainRow.team });

  // ── Notifications + recommendations ──────────────────────────────────────
  console.log('\n▶ Notification channels (signed webhook, retry, history)');
  const rx = await startReceiver();
  const hook = await api('POST', '/api/v1/notifications/channels', { token: alice.token, body: { type: 'WEBHOOK', name: 'Pager', config: { url: `${rx.url}/hook` }, eventTypes: ['recommendation.created', 'notification.test'] } });
  const secret: string = hook.body.signingSecret;
  check('a webhook channel is created; its signing secret is shown ONCE and the destination is hidden', hook.status === 201 && /^whsec_/.test(secret) && !JSON.stringify(hook.body).includes(rx.url), hook.body);
  const listing = await api('GET', '/api/v1/notifications/channels', { token: alice.token });
  check('listing never returns the secret or URL', !listing.text.includes(secret) && !listing.text.includes(rx.url) && listing.body.channels[0].destination === '127.0.0.1/…', listing.body.channels[0]);
  const gone = await api('POST', '/api/v1/notifications/channels', { token: alice.token, body: { type: 'WEBHOOK', name: 'Dead', config: { url: `${rx.url}/gone` }, eventTypes: ['notification.test'] } });
  const flaky = await api('POST', '/api/v1/notifications/channels', { token: alice.token, body: { type: 'WEBHOOK', name: 'Flaky', config: { url: `${rx.url}/flaky` }, eventTypes: ['notification.test'] } });
  check('Slack must be a Slack host; unsafe schemes are rejected at creation', (await api('POST', '/api/v1/notifications/channels', { token: alice.token, body: { type: 'SLACK', name: 'x', config: { url: `${rx.url}/x` } } })).status === 400 && (await api('POST', '/api/v1/notifications/channels', { token: alice.token, body: { type: 'WEBHOOK', name: 'x', config: { url: 'ftp://example.com/x' } } })).status === 400);

  const test = await api('POST', `/api/v1/notifications/channels/${hook.body.id}/test`, { token: alice.token });
  check('a test event is queued for that one channel', test.status === 201 && test.body.queued === true, test.body);
  const got = await until(async () => rx.received.find((r) => r.path === '/hook'));
  check('the receiver got it, and the signature verifies with the documented scheme', !!got && verifyWebhook(secret, String(got.headers['x-spendguard-signature']), String(got.headers['x-spendguard-timestamp']), got.body), got && { headers: got.headers });
  check('the payload is the event envelope (no credentials, no content)', !!got && JSON.parse(got.body).type === 'notification.test' && !/whsec_|sk-|prompt/.test(got.body), got?.body);

  await api('POST', `/api/v1/notifications/channels/${gone.body.id}/test`, { token: alice.token });
  await api('POST', `/api/v1/notifications/channels/${flaky.body.id}/test`, { token: alice.token });
  const deadFailed = await until(async () => (await api('GET', `/api/v1/notifications/deliveries?channelId=${gone.body.id}`, { token: alice.token })).body.deliveries.find((x: any) => x.status === 'FAILED'));
  check('a 404 destination fails PERMANENTLY at once (no pointless retries), with the reason recorded', deadFailed?.attempts === 1 && /HTTP 404/.test(deadFailed.lastError), deadFailed);
  const retrying = await until(async () => (await api('GET', `/api/v1/notifications/deliveries?channelId=${flaky.body.id}`, { token: alice.token })).body.deliveries.find((x: any) => x.status === 'RETRYING'), 15000);
  check('a 500 destination goes RETRYING with the attempt recorded', retrying?.attempts === 1 && /HTTP 500/.test(retrying.lastError), retrying);
  const recovered = await until(async () => (await api('GET', `/api/v1/notifications/deliveries?channelId=${flaky.body.id}`, { token: alice.token })).body.deliveries.find((x: any) => x.status === 'SENT'), 45000, 1000);
  check('…and is delivered on the retry (exponential backoff), attempts = 2', recovered?.attempts === 2, recovered);

  const bobChannels = await api('GET', '/api/v1/notifications/channels', { token: bob.token });
  const bobHistory = await api('GET', '/api/v1/notifications/deliveries', { token: bob.token });
  check('bob sees none of alice\'s channels or deliveries, and cannot touch them (404)', bobChannels.body.channels.length === 0 && bobHistory.body.total === 0 && (await api('POST', `/api/v1/notifications/channels/${hook.body.id}/test`, { token: bob.token })).status === 404 && (await api('DELETE', `/api/v1/notifications/channels/${hook.body.id}`, { token: bob.token })).status === 404);

  console.log('\n▶ Recommendations');
  const refresh = await api('POST', '/api/v1/insights/recommendations/refresh', { token: alice.token });
  check('generation runs for the org', refresh.status === 201 && refresh.body.created >= 3 && refresh.body.evaluatedProjects === 1, refresh.body);
  const recs = (await api('GET', '/api/v1/insights/recommendations', { token: alice.token })).body.recommendations as any[];
  const by = (t: string) => recs.find((r) => r.type === t);
  check('every recommendation carries evidence, method, impact basis, confidence and an action', recs.length >= 3 && recs.every((r) => r.evidence && r.method.length > 40 && ['low', 'medium', 'high'].includes(r.confidence) && r.action && typeof r.requiresApproval === 'boolean'), recs.map((r) => r.type));
  const spend = by('SPEND_INCREASE');
  check('SPEND_INCREASE fires and cites real ledger request ids', !!spend && spend.evidence.ledgerRequestIds.length > 0 && spend.impact.lowUsd > 0, spend && { impact: spend.impact });
  const spendIds: string[] = spend.evidence.ledgerRequestIds;
  check('…each cited id exists in the ledger for this project', (await prisma.request.count({ where: { id: { in: spendIds }, projectId: proj.id } })) === spendIds.length);
  const conc = by('MODEL_CONCENTRATION');
  check('MODEL_CONCENTRATION: gpt-4o-mini holds ~74% of spend', !!conc && /gpt-4o-mini is 7\d%/.test(conc.title), conc?.title);
  const tok = by('HIGH_TOKEN_APPLICATION');
  check('HIGH_TOKEN_APPLICATION: "docsum" averages 4,500 tokens vs the peer median 1,200', !!tok && /docsum/.test(tok.title) && tok.evidence.peerMedianTokensPerRequest === 1200, tok?.title);
  const evalRec = by('MODEL_EVALUATION');
  check('MODEL_EVALUATION requires approval, states cost-only, and is never "high" confidence', !!evalRec && evalRec.requiresApproval === true && /cost only/.test(evalRec.summary) && evalRec.confidence !== 'high' && !/equivalent|as good as/.test(JSON.stringify(evalRec)), evalRec && { c: evalRec.confidence, s: evalRec.summary });

  const second = await api('POST', '/api/v1/insights/recommendations/refresh', { token: alice.token });
  check('refreshing again updates in place: no duplicates', second.body.created === 0 && (await api('GET', '/api/v1/insights/recommendations', { token: alice.token })).body.recommendations.length === recs.length, second.body);

  const announced = await until(async () => rx.received.find((r) => r.path === '/hook' && JSON.parse(r.body).type === 'recommendation.created'), 20000);
  check('a critical/warning recommendation was published to the webhook channel (signed), as a SUMMARY only', !!announced && verifyWebhook(secret, String(announced.headers['x-spendguard-signature']), String(announced.headers['x-spendguard-timestamp']), announced.body) && !/ledgerRequestIds|req_/.test(announced.body), announced?.body);
  const history = await api('GET', `/api/v1/notifications/deliveries?channelId=${hook.body.id}`, { token: alice.token });
  check('delivery history shows SENT deliveries with attempts and titles', history.body.deliveries.length >= 2 && history.body.deliveries.every((x: any) => x.status === 'SENT' && x.attempts === 1 && x.title), history.body.deliveries);
  const inbox = await api('GET', '/api/v1/notifications/inbox', { token: alice.token });
  check('the in-app inbox has the recommendation events and counts unread', inbox.body.unread >= 1 && inbox.body.items.length >= 1, inbox.body.unread);

  console.log('\n▶ Human decisions (no configuration is ever changed)');
  const keysBefore = JSON.stringify((await api('GET', '/api/v1/keys', { token: alice.token })).body.gatewayKeys.map((k: any) => [k.id, k.allowedModels, k.allowedProviders]));
  const bobDecide = await api('PATCH', `/api/v1/insights/recommendations/${evalRec.id}`, { token: bob.token, body: { action: 'approve_evaluation' } });
  check('another organization cannot decide on it (404)', bobDecide.status === 404, bobDecide.status);
  const approve = await api('PATCH', `/api/v1/insights/recommendations/${evalRec.id}`, { token: alice.token, body: { action: 'approve_evaluation', note: 'Evaluate on our own prompts first' } });
  check('the owner approves the EVALUATION; it only records the decision', approve.status === 200 && approve.body.status === 'APPROVED_FOR_EVALUATION' && /does not change any model configuration/.test(approve.body.note), approve.body);
  const keysAfter = JSON.stringify((await api('GET', '/api/v1/keys', { token: alice.token })).body.gatewayKeys.map((k: any) => [k.id, k.allowedModels, k.allowedProviders]));
  check('no key or model configuration changed as a result', keysAfter === keysBefore);
  const decided = (await api('GET', '/api/v1/insights/recommendations', { token: alice.token })).body.recommendations.find((r: any) => r.id === evalRec.id);
  check('the decision is visible: status, time and note', decided.status === 'APPROVED_FOR_EVALUATION' && !!decided.decidedAt && decided.decisionNote === 'Evaluate on our own prompts first', decided);
  const nonApproval = await api('PATCH', `/api/v1/insights/recommendations/${spend.id}`, { token: alice.token, body: { action: 'approve_evaluation' } });
  check('"approve" is refused for findings that involve no approval', nonApproval.status === 400, nonApproval.body);
  const afterRefresh = await api('POST', '/api/v1/insights/recommendations/refresh', { token: alice.token });
  const stillApproved = (await api('GET', '/api/v1/insights/recommendations', { token: alice.token })).body.recommendations.find((r: any) => r.id === evalRec.id);
  check('a human-approved finding is not reset by regeneration', afterRefresh.status === 201 && stillApproved.status === 'APPROVED_FOR_EVALUATION', stillApproved?.status);

  rx.close();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Insights suite crashed:', err);
  process.exit(1);
});
