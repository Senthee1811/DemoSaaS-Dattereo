/**
 * SpendGuard live reliability suite (companion to e2e-scenarios.ts).
 *
 * Drives a RUNNING backend with real Postgres, Redis, BullMQ workers and the mock upstream
 * (test/mock-upstream.ts) and verifies, end to end:
 *   - failed provider calls are audited in request_attempts (no spend, no secrets), tenant-scoped
 *   - a provider credential failure is a 502, never a SpendGuard-style 401
 *   - the gateway reports reservation overruns and an honest "pending" anomaly state
 *   - the anomaly worker resolves PENDING -> CLEAR/ANOMALY, alerts once per window
 *   - a request whose evaluation was LOST is recovered by the sweep from Postgres
 *
 * Usage (backend started with ANOMALY_SWEEP_INTERVAL_MS=3000 ANOMALY_SWEEP_MIN_AGE_MS=1000):
 *   E2E_BASE_URL=http://localhost:4000 E2E_MOCK_URL=http://localhost:4555 DATABASE_URL=... npm run test:e2e:reliability
 * Run against a disposable database: it creates organizations and users.
 */
import { PrismaClient } from '@prisma/client';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const MOCK = (process.env.E2E_MOCK_URL || 'http://localhost:4555').replace(/\/$/, '');
const RUN = Date.now().toString(36);

let passed = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? `\n      → ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  }
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  return { status: res.status, body, headers: res.headers, text };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | undefined | false>, timeoutMs = 40000, everyMs = 500): Promise<T | undefined> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await sleep(everyMs);
  }
  return undefined;
}

async function register(name: string, orgName: string) {
  const email = `${name.toLowerCase()}.${RUN}@e2e.spendguard.test`;
  const res = await api('POST', '/auth/register', { body: { email, password: 'CorrectHorse!42', name, orgName } });
  return { token: res.body.accessToken as string, orgId: res.body.user?.orgId as string, status: res.status };
}

/** A project with one OpenAI provider key and one gateway key. */
async function setup(token: string, name: string, providerKey: string) {
  const proj = await api('POST', '/api/v1/projects', { token, body: { name, budgetMonthly: 100 } });
  const projectId = proj.body.project.id as string;
  await api('POST', '/api/v1/keys', { token, body: { type: 'PROVIDER', projectId, provider: 'OPENAI', keyName: 'k', plainKey: providerKey } });
  const gw = await api('POST', '/api/v1/keys', { token, body: { type: 'GATEWAY', projectId, keyName: 'app' } });
  return { projectId, gateway: gw.body.secret as string };
}

const call = (gateway: string, content: string, extra: Record<string, unknown> = {}) =>
  api('POST', '/v1/chat/completions', { token: gateway, body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content }], max_tokens: 50, ...extra } });

const auditRows = async (token: string, projectId: string, extra = '') =>
  (await api('GET', `/api/v1/audit?projectId=${projectId}&limit=100${extra}`, { token })).body.logs as any[];

async function run() {
  console.log(`\nSpendGuard live reliability E2E against ${BASE} (run ${RUN})\n`);
  const prisma = new PrismaClient();

  const alice = await register('Alice', `Alice Org ${RUN}`);
  const bob = await register('Bob', `Bob Org ${RUN}`);
  check('two organizations registered', alice.status === 201 && bob.status === 201 && alice.orgId !== bob.orgId, [alice.status, bob.status]);

  // ── Failed upstream calls ───────────────────────────────────────────────
  console.log('▶ Failed provider calls: normalized, audited, never billed');
  const bad401 = await setup(alice.token, `P401 ${RUN}`, 'sk-mockfail401-abcdefghijklmnop');
  const bad500 = await setup(alice.token, `P500 ${RUN}`, 'sk-mockfail500-abcdefghijklmnop');
  const bad429 = await setup(alice.token, `P429 ${RUN}`, 'sk-mockfail429-abcdefghijklmnop');

  const r401 = await call(bad401.gateway, 'SECRET-PROMPT-401');
  check('provider rejects the key → 502 (NOT a SpendGuard 401)', r401.status === 502, r401.status);
  check('… with code upstream_auth_failed and the provider named', r401.body.error?.code === 'upstream_auth_failed' && r401.body.error?.upstream_provider === 'OpenAI', r401.body);
  check('the provider key echoed by the provider is scrubbed from the response', !r401.text.includes('mockfail401') && !r401.text.includes('abcdefghijklmnop'), r401.text.slice(0, 200));

  const r500 = await call(bad500.gateway, 'SECRET-PROMPT-500');
  check('provider 500 HTML page → 502 upstream_server_error with no raw body or stack', r500.status === 502 && r500.body.error?.code === 'upstream_server_error' && !r500.text.includes('Traceback') && !r500.text.includes('<html>'), r500.body);
  const r429 = await call(bad429.gateway, 'SECRET-PROMPT-429');
  check('provider 429 → 429 upstream_rate_limited carrying retry_after_seconds', r429.status === 429 && r429.body.error?.code === 'upstream_rate_limited' && r429.body.error?.retry_after_seconds === 9, r429.body);

  const attempts = await api('GET', '/api/v1/audit/attempts?limit=100', { token: alice.token });
  const mine = (attempts.body.attempts as any[]).filter((a) => [bad401.projectId, bad500.projectId, bad429.projectId].includes(a.projectId));
  check('3 failed attempts are recorded for the org', attempts.status === 200 && mine.length === 3, attempts.body);
  const byClass = Object.fromEntries(mine.map((a) => [a.errorClass, a]));
  check('classified: auth_failed / server_error / rate_limited with statuses', byClass.upstream_auth_failed?.httpStatus === 502 && byClass.upstream_auth_failed?.upstreamStatus === 401 && byClass.upstream_server_error?.upstreamStatus === 500 && byClass.upstream_rate_limited?.httpStatus === 429, mine);
  check('each carries the released reservation, a duration and the provider/model', mine.every((a) => a.estimatedCostUsd > 0 && a.durationMs >= 0 && a.provider === 'OPENAI' && a.model === 'gpt-4o-mini'), mine);
  const stored = JSON.stringify(attempts.body);
  check('no prompt text, provider key or raw provider body in the audit rows', !/SECRET-PROMPT|mockfail|abcdefghijklmnop|Traceback/.test(stored), stored.slice(0, 300));

  const bobAttempts = await api('GET', '/api/v1/audit/attempts?limit=100', { token: bob.token });
  check('bob sees none of alice\'s failed attempts', bobAttempts.status === 200 && bobAttempts.body.total === 0, bobAttempts.body);
  const bobProbe = await api('GET', `/api/v1/audit/attempts?projectId=${bad401.projectId}&limit=100`, { token: bob.token });
  check('bob cannot reach alice\'s attempts by naming her project', bobProbe.status === 200 && bobProbe.body.total === 0, bobProbe.body);
  const noAuth = await api('GET', '/api/v1/audit/attempts');
  check('the attempts API requires authentication', noAuth.status === 401, noAuth.status);

  // ── Unknown provider cost: classification, exposure, reconciliation (Phase 2.4) ──
  console.log('▶ Failed calls that may have been billed: exposure and reconciliation');
  check('a provider 401/429 is "no charge expected"; a provider 500 is "uncertain" (it may have run)',
    byClass.upstream_auth_failed?.billingStatus === 'NOT_EXPECTED' && byClass.upstream_rate_limited?.billingStatus === 'NOT_EXPECTED' && byClass.upstream_server_error?.billingStatus === 'UNCERTAIN' && byClass.upstream_server_error?.executionStatus === 'PROVIDER_ERROR', mine);
  const exposure = await api('GET', '/api/v1/audit/attempts/exposure', { token: alice.token });
  const openai = (exposure.body.unreconciled ?? []).find((r: any) => r.provider === 'OPENAI' && r.billingStatus === 'UNCERTAIN');
  check('exposure lists the uncertain call with its upper bound, and says it is not a charge', exposure.status === 200 && openai?.attempts >= 1 && openai?.maxExposureUsd > 0 && /upper bound/.test(exposure.body.note), exposure.body);
  const bobExposure = await api('GET', '/api/v1/audit/attempts/exposure', { token: bob.token });
  check("bob's exposure does not include alice's calls", bobExposure.status === 200 && (bobExposure.body.unreconciled ?? []).length === 0, bobExposure.body);
  const uncertainId = byClass.upstream_server_error?.id;
  const bobReconcile = await api('PATCH', `/api/v1/audit/attempts/${uncertainId}/reconcile`, { token: bob.token, body: { status: 'NOT_CHARGED_CONFIRMED' } });
  check("bob cannot reconcile alice's attempt (404, unchanged)", bobReconcile.status === 404, bobReconcile.status);
  const badAmount = await api('PATCH', `/api/v1/audit/attempts/${uncertainId}/reconcile`, { token: alice.token, body: { status: 'CHARGED_CONFIRMED' } });
  check('"charged" without an invoiced amount is refused (400)', badAmount.status === 400, badAmount.body);
  const spendBefore = await prisma.request.aggregate({ where: { projectId: bad500.projectId }, _sum: { costEstimate: true }, _count: { id: true } });
  const rec = await api('PATCH', `/api/v1/audit/attempts/${uncertainId}/reconcile`, { token: alice.token, body: { status: 'CHARGED_CONFIRMED', costUsd: 0.0123, note: 'INV-1' } });
  check('alice records the invoice outcome', rec.status === 200 && rec.body.reconciledStatus === 'CHARGED_CONFIRMED' && rec.body.reconciledCostUsd === 0.0123, rec.body);
  const spendAfter = await prisma.request.aggregate({ where: { projectId: bad500.projectId }, _sum: { costEstimate: true }, _count: { id: true } });
  check('recording it wrote NOTHING to the spend ledger', spendAfter._count.id === spendBefore._count.id && Number(spendAfter._sum.costEstimate ?? 0) === Number(spendBefore._sum.costEstimate ?? 0), { spendBefore, spendAfter });
  const again = await api('PATCH', `/api/v1/audit/attempts/${uncertainId}/reconcile`, { token: alice.token, body: { status: 'NOT_CHARGED_CONFIRMED' } });
  check('a recorded outcome cannot be silently overwritten (400)', again.status === 400, again.body);
  const after = await api('GET', '/api/v1/audit/attempts/exposure', { token: alice.token });
  check('it leaves the open exposure and appears as "confirmed, not in the ledger"', !(after.body.unreconciled ?? []).some((r: any) => r.billingStatus === 'UNCERTAIN' && r.provider === 'OPENAI') && (after.body.confirmedUnledgeredUsd ?? []).some((r: any) => r.usd === 0.0123), after.body);
  const auditRow = await prisma.auditLog.findFirst({ where: { action: 'attempt.reconciled', orgId: alice.orgId } });
  check('the reconciliation is in the audit trail with the actor', !!auditRow && JSON.parse(auditRow.metadata ?? '{}').attemptId === uncertainId, auditRow);
  const acc = await api('GET', '/api/v1/audit/estimator-accuracy?days=30', { token: alice.token });
  check('the estimator report answers, scoped to the org, without enough data to change any margin', acc.status === 200 && Array.isArray(acc.body.groups) && acc.body.providers.every((p: any) => p.verdict === 'insufficient_data'), acc.body);
  const memberProbe = await api('GET', '/api/v1/audit/attempts/exposure');
  check('exposure requires authentication', memberProbe.status === 401, memberProbe.status);

  const ledger = await Promise.all([bad401, bad500, bad429].map((p) => auditRows(alice.token, p.projectId)));
  check('failed calls left NO rows in the spend ledger and charged nothing', ledger.every((rows) => rows.length === 0), ledger.map((r) => r.length));
  const spend = await prisma.request.aggregate({ where: { projectId: { in: [bad401.projectId, bad500.projectId, bad429.projectId] } }, _sum: { costEstimate: true }, _count: { id: true } });
  check('database agrees: 0 request rows for the failed projects', spend._count.id === 0, spend);

  // ── Honest anomaly state + reservation reporting ────────────────────────
  console.log('\n▶ Anomaly state is honest; reservation overruns are reported');
  const good = await setup(alice.token, `Good ${RUN}`, 'sk-goodkey-abcdefghijklmnop');
  const ok = await call(good.gateway, 'a normal request');
  check('success response: is_anomaly is null (not "false") and anomaly.status is pending', ok.status === 200 && ok.body.governance.is_anomaly === null && ok.body.governance.anomaly?.status === 'pending', ok.body.governance);
  check('legacy governance keys are all still present', ['cost_estimate_usd', 'latency_ms', 'anomaly_reason', 'project_id', 'budget_remaining_usd', 'fail_closed_active'].every((k) => k in ok.body.governance), Object.keys(ok.body.governance));
  check('header X-SpendGuard-Anomaly-Status: pending', ok.headers.get('x-spendguard-anomaly-status') === 'pending');
  check('the real finish reason is returned', ok.body.choices[0].finish_reason === 'stop' && ok.body.governance.provider_finish_reason === 'stop', ok.body.choices);

  const resolved = await until(async () => {
    const rows = await auditRows(alice.token, good.projectId);
    return rows.length && rows[0].anomalyStatus !== 'PENDING' ? rows[0] : undefined;
  });
  check('the worker resolves it: PENDING → CLEAR (isAnomaly stays false)', resolved?.anomalyStatus === 'CLEAR' && resolved?.isAnomaly === false, resolved);
  // The mock bills a fixed 1200 prompt tokens whatever the prompt, so this tiny request legitimately overran its
  // small reservation. The invariant is what matters: overrun = max(0, charged - reserved), recorded on the row.
  check(
    'the ledger row carries reserved cost and overrun, and overrun = max(0, cost - reserved)',
    typeof resolved?.reservedCost === 'number' && Math.abs(resolved.reservationOverrun - Math.max(0, resolved.costEstimate - resolved.reservedCost)) < 1e-6,
    resolved,
  );

  // ── Spike: overrun reported, ANOMALY confirmed, one alert per window ────
  console.log('\n▶ A spike: reservation overrun, confirmed ANOMALY, alert deduplicated');
  const spikeProj = await setup(alice.token, `Spike ${RUN}`, 'sk-goodkey-abcdefghijklmnop');
  const spike = await call(spikeProj.gateway, 'MOCK_SPIKE please');
  const resv = spike.body.governance?.reservation;
  check('the spike reports reserved < actual and a positive overrun (the cap is enforced on reservations)', spike.status === 200 && resv?.overrun_usd > 0 && resv.actual_usd > resv.reserved_usd, resv);
  check('the overrun header matches', Number(spike.headers.get('x-spendguard-reservation-overrun')) === resv?.overrun_usd, spike.headers.get('x-spendguard-reservation-overrun'));
  const flagged = await until(async () => (await auditRows(alice.token, spikeProj.projectId)).find((r) => r.anomalyStatus === 'ANOMALY'));
  check('the worker confirms it: anomalyStatus ANOMALY and isAnomaly true', flagged?.isAnomaly === true && flagged?.anomalyStatus === 'ANOMALY', flagged);
  check('the stored overrun is queryable on the row', flagged?.reservationOverrun > 0 && Math.abs(flagged.reservationOverrun - resv.overrun_usd) < 1e-6, flagged);

  for (let i = 0; i < 4; i++) await call(spikeProj.gateway, `MOCK_SPIKE again ${i}`);
  await until(async () => (await auditRows(alice.token, spikeProj.projectId)).every((r) => r.anomalyStatus !== 'PENDING') || undefined, 40000);
  const alerts = await api('GET', `/api/v1/alerts?projectId=${spikeProj.projectId}`, { token: alice.token });
  const spikeAlerts = (alerts.body.alerts as any[]).filter((a) => a.thresholdType === 'ANOMALY_DETECTED');
  check('5 spikes on one project+model raised exactly ONE anomaly alert', spikeAlerts.length === 1, spikeAlerts.length);
  const analytics = await api('GET', `/api/v1/analytics?projectId=${spikeProj.projectId}`, { token: alice.token });
  const sum = analytics.body.summary ?? analytics.body.data?.summary;
  check('analytics: confirmed anomalies vs overrun totals are reported separately and are additive', sum && typeof sum.anomalyCount === 'number' && sum.reservationOverrunCount >= 1 && sum.reservationOverrunUsd > 0 && typeof sum.anomalyPendingCount === 'number', sum);

  // ── Recovery: a lost evaluation is rebuilt from Postgres ────────────────
  console.log('\n▶ Recovery: a request whose queue job was lost is re-evaluated by the sweep');
  const sweepProj = await setup(alice.token, `Sweep ${RUN}`, 'sk-goodkey-abcdefghijklmnop');
  const lostId = `req_lost_${RUN}`;
  await prisma.request.create({
    data: {
      id: lostId, projectId: sweepProj.projectId, provider: 'OPENAI', model: 'gpt-4o-mini', tokensIn: 100, tokensOut: 20, totalTokens: 120,
      costEstimate: 0.0001, latencyMs: 50, statusCode: 200, anomalyStatus: 'PENDING', createdAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });
  const before = await prisma.request.findUnique({ where: { id: lostId }, select: { anomalyStatus: true } });
  check('a PENDING row exists with no job in the queue (as after a Redis wipe)', before?.anomalyStatus === 'PENDING');
  const recovered = await until(async () => {
    const r = await prisma.request.findUnique({ where: { id: lostId }, select: { anomalyStatus: true, anomalyEvaluatedAt: true } });
    return r && r.anomalyStatus !== 'PENDING' ? r : undefined;
  }, 60000);
  check('the sweep re-queued it and the worker resolved it (no longer PENDING)', recovered?.anomalyStatus === 'CLEAR' && !!recovered.anomalyEvaluatedAt, recovered);

  // ── Wire contract with the providers ────────────────────────────────────
  console.log('\n▶ Wire contract');
  const stats = await (await fetch(`${MOCK}/__stats`)).json();
  check('OpenAI calls send max_completion_tokens (and never the deprecated max_tokens)', stats.limitParams.max_completion_tokens > 0 && stats.limitParams.max_tokens === 0, stats.limitParams);

  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Reliability suite crashed:', err);
  process.exit(1);
});
