/**
 * SpendGuard live end-to-end suite.
 *
 * Drives the real HTTP API of a running backend (Postgres + Redis) and asserts
 * the security and product guarantees end to end: authentication, tenant
 * isolation, RBAC, the governed gateway, budgets, audit, alerts, team invites,
 * deactivation and billing.
 *
 * Usage:
 *   E2E_BASE_URL=http://localhost:4000 npm run test:e2e
 *
 * The success-path gateway scenarios need an OpenAI-compatible upstream. Point
 * the backend at a mock with OPENAI_BASE_URL so no real provider is billed.
 * Run against a disposable database — the suite creates organizations and users.
 */

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const RUN = Date.now().toString(36);

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? `\n      → ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

interface ApiResult {
  status: number;
  body: any;
  headers: Headers;
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* CSV or plain text */
  }
  return { status: res.status, body, headers: res.headers };
}

async function register(name: string, orgName: string, extra: Record<string, unknown> = {}) {
  const email = `${name.toLowerCase()}.${RUN}@e2e.spendguard.test`;
  const res = await api('POST', '/auth/register', {
    body: { email, password: 'CorrectHorse!42', name, orgName, ...extra },
  });
  return { ...res, email };
}

const chat = (content: string) => ({ model: 'gpt-4o-mini', messages: [{ role: 'user', content }], max_tokens: 50 });

async function run() {
  console.log(`\nSpendGuard live E2E against ${BASE} (run ${RUN})\n`);

  // ── 1. Health & public surface ───────────────────────────────────────────
  console.log('▶ Health & public endpoints');
  const health = await api('GET', '/health');
  check('health is public and reports ok', health.status === 200 && health.body.status === 'ok', health.body);
  const pricing = await api('GET', '/api/v1/pricing');
  check('pricing catalog is public', pricing.status === 200 && pricing.body.data != null, pricing.status);

  // ── 2. Authentication is enforced ────────────────────────────────────────
  console.log('\n▶ Authentication required on tenant APIs');
  for (const [m, p] of [
    ['GET', '/api/v1/projects'],
    ['POST', '/api/v1/projects'],
    ['GET', '/api/v1/keys'],
    ['DELETE', '/api/v1/keys?id=x&type=PROVIDER'],
    ['GET', '/api/v1/team'],
    ['GET', '/api/v1/audit'],
    ['GET', '/api/v1/audit/export'],
    ['GET', '/api/v1/analytics'],
    ['GET', '/api/v1/alerts'],
    ['PATCH', '/api/v1/alerts'],
    ['GET', '/api/v1/billing/subscription'],
    ['POST', '/api/v1/billing/checkout'],
  ] as const) {
    const r = await api(m, p, m === 'GET' || m === 'DELETE' ? {} : { body: {} });
    check(`${m} ${p} → 401 without token`, r.status === 401, r.status);
  }
  const forged = await api('GET', '/api/v1/projects', { token: 'not-a-real-jwt' });
  check('forged bearer token → 401', forged.status === 401, forged.status);

  // ── 3. Registration isolates tenants ─────────────────────────────────────
  console.log('\n▶ Registration creates isolated organizations');
  const alice = await register('Alice', `Acme ${RUN}`);
  const bob = await register('Bob', `Globex ${RUN}`);
  check('alice registered as OWNER', alice.status === 201 && alice.body.user?.role === 'OWNER', alice.body);
  check('bob registered as OWNER', bob.status === 201 && bob.body.user?.role === 'OWNER', bob.body);
  check('alice and bob are in different orgs', alice.body.user?.orgId && alice.body.user.orgId !== bob.body.user?.orgId);

  const aliceTeam = await api('GET', '/api/v1/team', { token: alice.body.accessToken });
  const aliceSlug = aliceTeam.body.organization?.slug;
  const mallory = await register('Mallory', 'Anything', { orgSlug: aliceSlug });
  check(
    'registering with another org\'s slug does NOT join that org',
    mallory.status === 201 && mallory.body.user?.orgId !== alice.body.user.orgId,
    mallory.body.user,
  );
  const dup = await api('POST', '/auth/register', {
    body: { email: alice.email.toUpperCase(), password: 'CorrectHorse!42', name: 'Dup' },
  });
  check('duplicate email (case-insensitive) → 409', dup.status === 409, dup.status);

  const A = alice.body.accessToken as string;
  const B = bob.body.accessToken as string;

  // ── 4. Login & refresh ───────────────────────────────────────────────────
  console.log('\n▶ Login & session refresh');
  const login = await api('POST', '/auth/login', { body: { email: `  ${alice.email.toUpperCase()} `, password: 'CorrectHorse!42' } });
  check('login works with differently-cased email', login.status === 200 && !!login.body.accessToken, login.status);
  const badLogin = await api('POST', '/auth/login', { body: { email: alice.email, password: 'wrong-password' } });
  check('wrong password → 401 with flat error message', badLogin.status === 401 && typeof badLogin.body.error?.message === 'string', badLogin.body);
  const refreshed = await api('POST', '/auth/refresh', { body: { refreshToken: alice.body.refreshToken } });
  check('refresh issues a new access token', refreshed.status === 200 && !!refreshed.body.accessToken, refreshed.status);
  const badRefresh = await api('POST', '/auth/refresh', { body: { refreshToken: A } });
  check('access token cannot be used as refresh token', badRefresh.status === 401, badRefresh.status);

  // ── 5. Projects are tenant-scoped ────────────────────────────────────────
  console.log('\n▶ Projects: tenant scoping');
  const projA = await api('POST', '/api/v1/projects', { token: A, body: { name: 'Support Bot', budgetMonthly: 100 } });
  const projectA = projA.body.project;
  check('alice creates a project', projA.status === 201 && !!projectA?.id, projA.body);
  check('project belongs to alice\'s org', projectA?.orgId === alice.body.user.orgId, projectA?.orgId);

  const bobList = await api('GET', '/api/v1/projects', { token: B });
  check('bob cannot see alice\'s project', bobList.status === 200 && !bobList.body.projects.some((p: any) => p.id === projectA.id));
  const aliceList = await api('GET', '/api/v1/projects', { token: A });
  check('alice sees her project', aliceList.body.projects?.some((p: any) => p.id === projectA.id));

  const bobPatch = await api('PATCH', '/api/v1/projects', { token: B, body: { id: projectA.id, isBlocked: true } });
  check('bob cannot modify alice\'s project (404)', bobPatch.status === 404, bobPatch.status);
  const slugClash = await api('POST', '/api/v1/projects', { token: A, body: { name: 'Support Bot', budgetMonthly: 10 } });
  check('duplicate project slug in same org → 409', slugClash.status === 409, slugClash.status);

  // ── 6. Key vault ─────────────────────────────────────────────────────────
  console.log('\n▶ Key vault: tenant scoping');
  const pk = await api('POST', '/api/v1/keys', {
    token: A,
    body: { type: 'PROVIDER', projectId: projectA.id, provider: 'OPENAI', keyName: 'Primary', plainKey: 'sk-e2e-test-key-1234567890' },
  });
  check('alice stores an encrypted provider key', pk.status === 201 && pk.body.maskedPreview === 'sk-...7890', pk.body);
  check('provider key plaintext is never returned', !JSON.stringify(pk.body).includes('sk-e2e-test-key-1234567890'));

  const bobKeyOnA = await api('POST', '/api/v1/keys', {
    token: B,
    body: { type: 'GATEWAY', projectId: projectA.id, keyName: 'steal' },
  });
  check('bob cannot mint a gateway key for alice\'s project (404)', bobKeyOnA.status === 404, bobKeyOnA.status);

  const gw = await api('POST', '/api/v1/keys', { token: A, body: { type: 'GATEWAY', projectId: projectA.id, keyName: 'App' } });
  const gatewayKey: string = gw.body.secret;
  check('alice mints a gateway key (shown once)', gw.status === 201 && /^sg_live_[0-9a-f]+$/.test(gatewayKey || ''), gw.body);

  const bobKeys = await api('GET', '/api/v1/keys', { token: B });
  check('bob\'s key listing excludes alice\'s keys', bobKeys.body.providerKeys?.length === 0 && bobKeys.body.gatewayKeys?.length === 0, bobKeys.body);
  const bobRevoke = await api('DELETE', `/api/v1/keys?id=${gw.body.id}&type=GATEWAY`, { token: B });
  check('bob cannot revoke alice\'s key (404)', bobRevoke.status === 404, bobRevoke.status);
  const badType = await api('POST', '/api/v1/keys', { token: A, body: { type: 'TEST_CONNECTION', provider: 'OPENAI' } });
  check('unknown key type → 400 (not silently stored)', badType.status === 400, badType.status);

  // ── 7. Gateway authentication ────────────────────────────────────────────
  console.log('\n▶ Gateway: credentials are mandatory');
  const noCreds = await api('POST', '/v1/chat/completions', { body: chat('hi') });
  check('no credentials → 401', noCreds.status === 401, noCreds.status);
  const headerOnly = await api('POST', '/v1/chat/completions', {
    body: chat('hi'),
    headers: { 'x-spendguard-project-id': projectA.id },
  });
  check('project header alone is NOT enough → 401', headerOnly.status === 401, headerOnly.status);
  check('gateway errors are flat {error:{message}}', typeof noCreds.body.error?.message === 'string' && !noCreds.body.error?.error, noCreds.body);
  const badKey = await api('POST', '/v1/chat/completions', { token: 'sg_live_deadbeef', body: chat('hi') });
  check('invalid gateway key → 401', badKey.status === 401, badKey.status);
  const bobSession = await api('POST', '/v1/chat/completions', { token: B, body: { ...chat('hi'), projectId: projectA.id } });
  check('bob\'s session cannot use alice\'s project → 404', bobSession.status === 404, bobSession.status);

  // ── 8. Governed request path ─────────────────────────────────────────────
  console.log('\n▶ Gateway: governed request (mock upstream)');
  const ok = await api('POST', '/v1/chat/completions', {
    token: gatewayKey,
    body: { ...chat('hello from e2e'), userId: bob.body.user.id, projectId: 'ignored' },
  });
  check('gateway key request succeeds', ok.status === 200 && ok.body.object === 'chat.completion', ok.body);
  check('response is OpenAI-shaped with usage', ok.body.usage?.total_tokens === 1600, ok.body.usage);
  check('cost is computed from real usage', ok.body.governance?.cost_estimate_usd > 0, ok.body.governance);
  check('cost header is set', Number(ok.headers.get('x-spendguard-cost')) > 0, ok.headers.get('x-spendguard-cost'));
  check('the key decides the project (body projectId ignored)', ok.body.governance?.project_id === projectA.id);
  check('internal headers object is not leaked in body', ok.body.headers === undefined);

  const viaAlias = await api('POST', '/api/v1/chat/completions', { token: gatewayKey, body: chat('alias route') });
  check('/api/v1 alias works with same auth', viaAlias.status === 200, viaAlias.status);
  const viaSession = await api('POST', '/v1/chat/completions', { token: A, body: { ...chat('playground'), projectId: projectA.id } });
  check('dashboard session (playground) works for own project', viaSession.status === 200, viaSession.body);
  const streamReq = await api('POST', '/v1/chat/completions', { token: gatewayKey, body: { ...chat('x'), stream: true } });
  check('stream:true is rejected clearly (not silently ignored)', streamReq.status === 400, streamReq.status);

  // Request logs are written asynchronously
  await new Promise((r) => setTimeout(r, 1200));

  // ── 9. Audit & analytics are tenant-scoped ───────────────────────────────
  console.log('\n▶ Audit & analytics: tenant scoping');
  const auditA = await api('GET', '/api/v1/audit', { token: A });
  check('alice sees her 3 request logs', auditA.status === 200 && auditA.body.total === 3, auditA.body.total);
  check('spoofed body userId is not attributed', !auditA.body.logs?.some((l: any) => l.userId === bob.body.user.id), auditA.body.logs?.map((l: any) => l.userId));
  const auditB = await api('GET', '/api/v1/audit', { token: B });
  check('bob sees none of alice\'s logs', auditB.status === 200 && auditB.body.total === 0, auditB.body.total);
  const auditBFiltered = await api('GET', `/api/v1/audit?projectId=${projectA.id}`, { token: B });
  check('bob filtering by alice\'s projectId still sees nothing', auditBFiltered.body.total === 0, auditBFiltered.body.total);

  const analyticsA = await api('GET', '/api/v1/analytics', { token: A });
  const analyticsB = await api('GET', '/api/v1/analytics', { token: B });
  check('alice analytics counts her requests', analyticsA.body.summary?.totalRequests === 3, analyticsA.body.summary);
  check('bob analytics is empty', analyticsB.body.summary?.totalRequests === 0 && analyticsB.body.projectBreakdown?.length === 0, analyticsB.body.summary);

  const csvA = await api('GET', '/api/v1/audit/export', { token: A });
  const csvB = await api('GET', '/api/v1/audit/export', { token: B });
  check('alice CSV export has header + 3 rows', typeof csvA.body === 'string' && csvA.body.split('\r\n').length === 4, typeof csvA.body === 'string' ? csvA.body.split('\r\n').length : csvA.body);
  check('bob CSV export has header only', typeof csvB.body === 'string' && csvB.body.split('\r\n').length === 1);

  // ── 10. Alerts ───────────────────────────────────────────────────────────
  console.log('\n▶ Alerts: tenant scoping');
  const alert = await api('POST', '/api/v1/alerts', { token: A, body: { projectId: projectA.id, thresholdType: 'PERCENT_80' } });
  check('alice triggers a test alert', alert.status === 201 && !!alert.body.alert?.id, alert.body);
  const bobAlertOnA = await api('POST', '/api/v1/alerts', { token: B, body: { projectId: projectA.id, thresholdType: 'HARD_BLOCK' } });
  check('bob cannot create alerts on alice\'s project (404)', bobAlertOnA.status === 404, bobAlertOnA.status);
  await api('PATCH', '/api/v1/alerts', { token: B, body: { markAllRead: true } });
  const alertsA = await api('GET', '/api/v1/alerts', { token: A });
  check('bob "mark all read" does not touch alice\'s alerts', alertsA.body.alerts?.some((a: any) => a.id === alert.body.alert.id && !a.isRead), alertsA.body.alerts);
  const bobMarkOne = await api('PATCH', '/api/v1/alerts', { token: B, body: { id: alert.body.alert.id } });
  check('bob cannot mark alice\'s alert read (404)', bobMarkOne.status === 404, bobMarkOne.status);

  // ── 11. Budget hard block ────────────────────────────────────────────────
  console.log('\n▶ Budget: fail-closed hard block');
  const tiny = await api('POST', '/api/v1/projects', { token: A, body: { name: 'Tiny Budget', budgetMonthly: 0.0001 } });
  const tinyKey = await api('POST', '/api/v1/keys', { token: A, body: { type: 'GATEWAY', projectId: tiny.body.project.id, keyName: 'tiny' } });
  // Worst-case estimate for 20k output tokens on gpt-4o-mini ≈ $0.012, far above the $0.0001 cap
  const blocked = await api('POST', '/v1/chat/completions', {
    token: tinyKey.body.secret,
    body: { ...chat('expensive'), max_tokens: 20000 },
  });
  check('request whose worst case exceeds remaining budget → 429 budget_exceeded', blocked.status === 429 && blocked.body.error?.code === 'budget_exceeded', blocked.body);
  const tinyAfter = await api('GET', '/api/v1/projects', { token: A });
  const tinyProj = tinyAfter.body.projects.find((p: any) => p.id === tiny.body.project.id);
  check('an over-sized request alone does NOT freeze the project', tinyProj?.isBlocked === false, tinyProj);

  // Real spend reaching the cap: each mock call settles at ≈ $0.00042 (1200 in / 400 out on gpt-4o-mini)
  const capped = await api('POST', '/api/v1/projects', { token: A, body: { name: 'Capped', budgetMonthly: 0.0005 } });
  const cappedId = capped.body.project.id;
  await api('POST', '/api/v1/keys', {
    token: A,
    body: { type: 'PROVIDER', projectId: cappedId, provider: 'OPENAI', keyName: 'p', plainKey: 'sk-e2e-capped-key-0000' },
  });
  const cappedKey = (await api('POST', '/api/v1/keys', { token: A, body: { type: 'GATEWAY', projectId: cappedId, keyName: 'c' } })).body.secret;
  const statuses: number[] = [];
  for (let i = 0; i < 3; i++) {
    statuses.push((await api('POST', '/v1/chat/completions', { token: cappedKey, body: chat(`spend ${i}`) })).status);
  }
  check('requests succeed until settled spend reaches the cap, then 429', statuses.join(',') === '200,200,429', statuses);
  const cappedProj = (await api('GET', '/api/v1/projects', { token: A })).body.projects.find((p: any) => p.id === cappedId);
  check('project is frozen once actual spend reaches the cap', cappedProj?.isBlocked === true, cappedProj);
  const cappedAgain = await api('POST', '/v1/chat/completions', { token: cappedKey, body: { ...chat('tiny'), max_tokens: 1 } });
  check('frozen project rejects even tiny requests (fail-closed)', cappedAgain.status === 429, cappedAgain.status);
  const hardBlockAlerts = (await api('GET', '/api/v1/alerts', { token: A })).body.alerts.filter(
    (a: any) => a.projectId === cappedId && a.thresholdType === 'HARD_BLOCK',
  );
  check('exactly one HARD_BLOCK alert is raised', hardBlockAlerts.length === 1, hardBlockAlerts.length);

  // ── 12. Key revocation ───────────────────────────────────────────────────
  console.log('\n▶ Key revocation');
  const revoke = await api('DELETE', `/api/v1/keys?id=${tinyKey.body.id}&type=GATEWAY`, { token: A });
  check('alice revokes a key', revoke.status === 200, revoke.status);
  const afterRevoke = await api('POST', '/v1/chat/completions', { token: tinyKey.body.secret, body: chat('x') });
  check('revoked key → 401', afterRevoke.status === 401, afterRevoke.status);

  // ── 13. Team invite, RBAC, deactivation ──────────────────────────────────
  console.log('\n▶ Team: invite, RBAC, deactivation');
  const carolEmail = `carol.${RUN}@e2e.spendguard.test`;
  const invite = await api('POST', '/api/v1/team', { token: A, body: { name: 'Carol', email: carolEmail, role: 'MEMBER' } });
  check('alice invites carol into her org', invite.status === 201 && invite.body.user?.orgId === alice.body.user.orgId, invite.body);
  check('invite returns a set-password token (dev)', typeof invite.body.invite?.token === 'string', invite.body.invite);
  const setPw = await api('POST', '/auth/reset-password', { body: { token: invite.body.invite.token, newPassword: 'CarolsOwnPass#1' } });
  check('carol sets her password via the invite token', setPw.status === 200, setPw.body);
  const reuse = await api('POST', '/auth/reset-password', { body: { token: invite.body.invite.token, newPassword: 'AnotherPass#2' } });
  check('invite token is single-use', reuse.status === 400, reuse.status);
  const carol = await api('POST', '/auth/login', { body: { email: carolEmail, password: 'CarolsOwnPass#1' } });
  check('carol can log in', carol.status === 200, carol.status);
  const C = carol.body.accessToken as string;

  const carolProjects = await api('GET', '/api/v1/projects', { token: C });
  check('carol sees alice\'s org projects', carolProjects.body.projects?.some((p: any) => p.id === projectA.id));
  const carolCreate = await api('POST', '/api/v1/projects', { token: C, body: { name: 'Nope', budgetMonthly: 5 } });
  check('MEMBER cannot create projects (403)', carolCreate.status === 403, carolCreate.status);
  const carolKey = await api('POST', '/api/v1/keys', { token: C, body: { type: 'GATEWAY', projectId: projectA.id, keyName: 'x' } });
  check('MEMBER cannot mint keys (403)', carolKey.status === 403, carolKey.status);
  const carolInvite = await api('POST', '/api/v1/team', { token: C, body: { name: 'Eve', email: `eve.${RUN}@e2e.spendguard.test`, role: 'ADMIN' } });
  check('MEMBER cannot invite (403)', carolInvite.status === 403, carolInvite.status);

  const promote = await api('PATCH', '/api/v1/team', { token: B, body: { userId: carol.body.user.id, role: 'OWNER' } });
  check('bob cannot change roles in alice\'s org (404)', promote.status === 404, promote.status);

  const deact = await api('POST', '/auth/deactivate', { token: C, body: { password: 'CarolsOwnPass#1', confirmPhrase: 'DEACTIVATE' } });
  check('carol deactivates her account', deact.status === 200, deact.body);
  const carolAfter = await api('GET', '/api/v1/projects', { token: C });
  check('deactivated user\'s existing token is rejected immediately', carolAfter.status === 401, carolAfter.status);
  const carolRelogin = await api('POST', '/auth/login', { body: { email: carolEmail, password: 'CarolsOwnPass#1' } });
  check('deactivated user cannot log in', carolRelogin.status === 401, carolRelogin.status);
  const carolRefresh = await api('POST', '/auth/refresh', { body: { refreshToken: carol.body.refreshToken } });
  check('deactivated user cannot refresh', carolRefresh.status === 401, carolRefresh.status);

  // ── 14. Billing & pricing ────────────────────────────────────────────────
  console.log('\n▶ Billing & pricing');
  const ent = await api('POST', '/api/v1/billing/checkout', { token: A, body: { tier: 'enterprise' } });
  check('enterprise is not sold via self-serve checkout (400)', ent.status === 400, ent.status);
  const starter = await api('POST', '/api/v1/billing/checkout', { token: A, body: { tier: 'starter' } });
  check('starter checkout returns a well-formed URL', starter.status === 201 && (starter.body.checkoutUrl?.match(/\?/g) || []).length === 1, starter.body);
  const sub = await api('GET', '/api/v1/billing/subscription?orgId=someone-else', { token: B });
  check('subscription is always for the caller\'s own org', sub.body.orgId === bob.body.user.orgId, sub.body);
  const pricingWrite = await api('POST', '/api/v1/pricing', {
    token: A,
    body: { model: 'gpt-4o-mini', provider: 'OPENAI', inputPricePerMillion: 0, outputPricePerMillion: 0 },
  });
  check('org OWNER cannot rewrite the shared pricing catalog (403)', pricingWrite.status === 403, pricingWrite.status);

  // ── 15. Rate limit covers every route alias (run last: it exhausts the IP window) ──
  console.log('\n▶ Gateway IP rate limit');
  let limited = false;
  for (let i = 0; i < 70 && !limited; i++) {
    const r = await api('POST', '/api/v1/chat/completions', { body: chat('x'), headers: { 'X-Forwarded-For': `10.0.0.${i}` } });
    if (r.status === 429) limited = true;
  }
  check('rate limit applies to /api/v1 alias and ignores spoofed X-Forwarded-For', limited);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('Failed checks:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('E2E suite crashed:', err);
  process.exit(1);
});
