/**
 * Redis outage recovery check (Phase 1, item 2).
 *
 *   request OK → stop Redis → 503 governance_unavailable → start Redis → OK again
 *   within 15 s, with NO backend restart.
 *
 * Needs a running backend (pointed at the mock upstream via OPENAI_BASE_URL) and
 * shell commands that stop/start the Redis instance that backend uses:
 *
 *   E2E_BASE_URL=http://localhost:4000 \
 *   E2E_REDIS_STOP_CMD="docker stop spendguard-redis" \
 *   E2E_REDIS_START_CMD="docker start spendguard-redis" \
 *   npm run test:redis-outage
 *
 * Run it against disposable infrastructure: it really takes Redis down.
 */
import { execSync } from 'child_process';

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const STOP = process.env.E2E_REDIS_STOP_CMD;
const START = process.env.E2E_REDIS_START_CMD;
/** Outage length. Must outlast the old 5-retry budget (~3 s) to prove the client keeps retrying. */
const OUTAGE_MS = Number(process.env.E2E_REDIS_OUTAGE_MS || 8000);
const RECOVERY_DEADLINE_MS = 15000;
const RUN = Date.now().toString(36);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, body: json };
}

async function main() {
  if (!STOP || !START) {
    console.error('Set E2E_REDIS_STOP_CMD and E2E_REDIS_START_CMD.');
    process.exit(2);
  }

  const reg = await api('POST', '/auth/register', undefined, {
    email: `outage.${RUN}@e2e.spendguard.test`,
    password: 'CorrectHorse!42',
    name: 'Outage',
    orgName: `Outage ${RUN}`,
  });
  const token = reg.body.accessToken;
  const proj = (await api('POST', '/api/v1/projects', token, { name: `Outage ${RUN}`, budgetMonthly: 100 })).body.project;
  await api('POST', '/api/v1/keys', token, {
    type: 'PROVIDER', projectId: proj.id, provider: 'OPENAI', keyName: 'p', plainKey: 'sk-e2e-outage-key-0000',
  });
  const gw = (await api('POST', '/api/v1/keys', token, { type: 'GATEWAY', projectId: proj.id, keyName: 'g' })).body.secret;
  const call = () =>
    api('POST', '/v1/chat/completions', gw, { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 10 });

  const results: [string, boolean, unknown][] = [];

  const before = await call();
  results.push(['request succeeds while Redis is up', before.status === 200, before.status]);

  console.log(`stopping Redis: ${STOP}`);
  execSync(STOP, { stdio: 'ignore' });
  let down: { status: number; body: any } = { status: 0, body: null };
  for (const t0 = Date.now(); Date.now() - t0 < 10000; ) {
    down = await call();
    if (down.status === 503) break;
    await sleep(300);
  }
  results.push([
    'Redis down → 503 governance_unavailable (fail-closed)',
    down.status === 503 && down.body?.error?.code === 'governance_unavailable',
    down,
  ]);

  await sleep(OUTAGE_MS);
  console.log(`starting Redis: ${START}`);
  execSync(START, { stdio: 'ignore' });

  const t0 = Date.now();
  let recovered = false;
  let last = 0;
  while (Date.now() - t0 < RECOVERY_DEADLINE_MS) {
    last = (await call()).status;
    if (last === 200) {
      recovered = true;
      break;
    }
    await sleep(500);
  }
  results.push([
    `gateway recovers within ${RECOVERY_DEADLINE_MS / 1000}s of Redis returning (no backend restart)`,
    recovered,
    { lastStatus: last, waitedMs: Date.now() - t0 },
  ]);

  let failed = 0;
  for (const [name, ok, detail] of results) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n      → ${JSON.stringify(detail).slice(0, 300)}`}`);
    if (!ok) failed++;
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('redis-outage check crashed:', err);
  // Best effort: never leave Redis stopped
  try {
    if (START) execSync(START, { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
