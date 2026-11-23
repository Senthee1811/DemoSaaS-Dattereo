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
  mockAtStart = await mockStats();

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
  check('invite response never contains a token', !JSON.stringify(invite.body).toLowerCase().includes('token'), invite.body);
  // The token only travels by email, so the test reads it from Redis, where the server stores it.
  const inviteToken = await findPasswordToken(carolEmail);
  check('an invite token was issued for carol', typeof inviteToken === 'string', inviteToken);
  const setPw = await api('POST', '/auth/reset-password', { body: { token: inviteToken, newPassword: 'CarolsOwnPass#1' } });
  check('carol sets her password via the invite token', setPw.status === 200, setPw.body);
  const reuse = await api('POST', '/auth/reset-password', { body: { token: inviteToken, newPassword: 'AnotherPass#2' } });
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
  if (process.env.E2E_STRIPE_CONFIGURED === 'true') {
    check('starter checkout returns a well-formed URL', starter.status === 201 && (starter.body.checkoutUrl?.match(/\?/g) || []).length === 1, starter.body);
  } else {
    // Phase 1: without Stripe, checkout must say so instead of faking a success redirect.
    // (The well-formed success_url guarantee is unit-tested with a mocked Stripe.)
    check('starter checkout without Stripe → 503 billing_not_configured (no fake success)', starter.status === 503 && starter.body.error?.code === 'billing_not_configured', starter.body);
  }
  const sub = await api('GET', '/api/v1/billing/subscription?orgId=someone-else', { token: B });
  check('subscription is always for the caller\'s own org', sub.body.orgId === bob.body.user.orgId, sub.body);
  const pricingWrite = await api('POST', '/api/v1/pricing', {
    token: A,
    body: { model: 'gpt-4o-mini', provider: 'OPENAI', inputPricePerMillion: 0, outputPricePerMillion: 0 },
  });
  check('org OWNER cannot rewrite the shared pricing catalog (403)', pricingWrite.status === 403, pricingWrite.status);

  // ── Slack alert delivery ─────────────────────────────────────────────────
  await securityWorkspace();
  await slackAlerts(A);

  // ── Phase 1 hardening ────────────────────────────────────────────────────
  await phase1(A);
  await groqProvider(A);

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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 hardening checks. They need the backend started with
//   OPENAI_BASE_URL=<mock>/v1  and  OPENAI_API_KEY=sk-platform-...  (a platform key
// that must NEVER be used for tenant traffic), and the mock upstream reachable at
// E2E_MOCK_URL so the suite can count upstream calls.
// ─────────────────────────────────────────────────────────────────────────────
const MOCK = (process.env.E2E_MOCK_URL || 'http://localhost:4555').replace(/\/$/, '');

let mockAtStart = { calls: 0, platformKeyCalls: 0, byModel: {} as Record<string, number> };

async function mockStats(): Promise<{ calls: number; platformKeyCalls: number; byModel: Record<string, number> }> {
  const res = await fetch(`${MOCK}/__stats`);
  return res.json();
}

/**
 * Phase 10: sessions, change password and security activity against the real API, database and Redis.
 * Revocation must really stop a session; ownership must be enforced; the password must really change.
 */
async function securityWorkspace() {
  console.log('');
  console.log('▶ Security: sessions, change password, activity');
  const PW = 'CorrectHorse!42';
  const NEW_PW = 'BrandNewPass#1';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
  const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

  const zed = await api('POST', '/auth/register', {
    headers: { 'User-Agent': DESKTOP },
    body: { email: `zed.${RUN}@e2e.spendguard.test`, password: PW, name: 'Zed', orgName: `Zed Org ${RUN}` },
  });
  const zedEmail = zed.body.user.email as string;
  const t1 = zed.body.accessToken as string; // this device
  const r1 = zed.body.refreshToken as string;
  const phone = await api('POST', '/auth/login', { headers: { 'User-Agent': IPHONE }, body: { email: zedEmail, password: PW } });
  const t2 = phone.body.accessToken as string; // the phone
  const r2 = phone.body.refreshToken as string;

  const list = await api('GET', '/auth/sessions', { token: t1 });
  const rows = list.body.sessions as Array<{ id: string; device: string; current: boolean }>;
  check('two sessions listed, with their devices', list.status === 200 && rows.length === 2 && rows.some((s) => s.device === 'Safari on iOS') && rows.some((s) => s.device === 'Chrome on Windows'), list.body);
  check('exactly one is marked as the current session, and it is the desktop one', rows.filter((s) => s.current).length === 1 && rows.find((s) => s.current)?.device === 'Chrome on Windows', rows);

  const overview = await api('GET', '/auth/security', { token: t1 });
  check('overview is real: 2 active sessions, MFA reported as unsupported, no score', overview.status === 200 && overview.body.sessions.active === 2 && overview.body.mfa.supported === false && !JSON.stringify(overview.body).match(/score|passwordHash/i), overview.body);

  // ── change password ──
  const wrong = await api('POST', '/auth/change-password', { token: t1, body: { currentPassword: 'not-it', newPassword: NEW_PW } });
  check('wrong current password → 400 invalid_current_password (never 401)', wrong.status === 400 && wrong.body.error?.code === 'invalid_current_password', wrong.body);
  const weak = await api('POST', '/auth/change-password', { token: t1, body: { currentPassword: PW, newPassword: 'short' } });
  check('weak new password → 400 weak_password', weak.status === 400 && weak.body.error?.code === 'weak_password', weak.body);
  const same = await api('POST', '/auth/change-password', { token: t1, body: { currentPassword: PW, newPassword: PW } });
  check('unchanged password → 400', same.status === 400, same.body);

  const changed = await api('POST', '/auth/change-password', { token: t1, body: { currentPassword: PW, newPassword: NEW_PW } });
  check('change password succeeds and reports the other session it signed out', changed.status === 200 && changed.body.otherSessionsSignedOut === 1 && !!changed.body.passwordChangedAt, changed.body);
  check('the response never contains a password or hash', !JSON.stringify(changed.body).match(/CorrectHorse|BrandNewPass|pbkdf2/i));

  const oldLogin = await api('POST', '/auth/login', { body: { email: zedEmail, password: PW } });
  check('the old password no longer signs in', oldLogin.status === 401, oldLogin.status);
  const newLogin = await api('POST', '/auth/login', { headers: { 'User-Agent': DESKTOP }, body: { email: zedEmail, password: NEW_PW } });
  check('the new password does', newLogin.status === 200, newLogin.status);

  // ── revocation really stops the other session ──
  const phoneRefresh = await api('POST', '/auth/refresh', { body: { refreshToken: r2 } });
  check('the signed-out phone can no longer refresh (401)', phoneRefresh.status === 401, phoneRefresh.status);
  const phoneAccess = await api('GET', '/auth/sessions', { token: t2 });
  check('and its access token is refused immediately (401), not after 15 minutes', phoneAccess.status === 401, phoneAccess.status);
  const deskRefresh = await api('POST', '/auth/refresh', { body: { refreshToken: r1 } });
  check('this device stays signed in (refresh works)', deskRefresh.status === 200 && !!deskRefresh.body.accessToken, deskRefresh.status);
  const t1b = deskRefresh.body.accessToken as string;

  // ── ownership ──
  const yan = await register('Yan', `Yan Org ${RUN}`);
  const yanSessions = await api('GET', '/auth/sessions', { token: yan.body.accessToken });
  const yanSid = yanSessions.body.sessions[0].id as string;
  const cross = await api('DELETE', `/auth/sessions/${yanSid}`, { token: t1b });
  check("revoking another user's session → 404 (not even acknowledged)", cross.status === 404, cross.status);
  const yanAfter = await api('GET', '/auth/sessions', { token: yan.body.accessToken });
  check("the other user's session is untouched", yanAfter.status === 200 && yanAfter.body.sessions.length === 1, yanAfter.body);
  const badId = await api('DELETE', '/auth/sessions/not-a-uuid', { token: t1b });
  check('a malformed session id is a 400, not a crash', badId.status === 400, badId.status);

  // ── sign out others, then the current-session confirmation ──
  const phone2 = await api('POST', '/auth/login', { headers: { 'User-Agent': IPHONE }, body: { email: zedEmail, password: NEW_PW } });
  const others = await api('POST', '/auth/sessions/revoke-others', { token: t1b });
  check('sign out others ends the other sessions and keeps this one', others.status === 200 && others.body.revoked >= 1, others.body);
  const phone2Refresh = await api('POST', '/auth/refresh', { body: { refreshToken: phone2.body.refreshToken } });
  check('the session it ended cannot refresh', phone2Refresh.status === 401, phone2Refresh.status);

  const mine = await api('GET', '/auth/sessions', { token: t1b });
  const currentSid = (mine.body.sessions as Array<{ id: string; current: boolean }>).find((s) => s.current)!.id;
  const noConfirm = await api('DELETE', `/auth/sessions/${currentSid}`, { token: t1b });
  check('revoking the CURRENT session without confirmation → 409 current_session', noConfirm.status === 409 && noConfirm.body.error?.code === 'current_session', noConfirm.body);

  // ── activity ──
  const activity = await api('GET', '/auth/security-activity?limit=5&offset=0', { token: t1b });
  const types = (activity.body.events as Array<{ type: string }>).map((e) => e.type);
  check('activity shows password change, revocations and sign-ins, newest first', activity.status === 200 && types.includes('PASSWORD_CHANGED') && types.includes('OTHER_SESSIONS_REVOKED') && types.includes('LOGIN_SUCCESS'), types);
  check('activity includes the failed attempt with the old password', (await api('GET', '/auth/security-activity?limit=50', { token: t1b })).body.events.some((e: { type: string }) => e.type === 'LOGIN_FAILED'));
  check('activity is paginated and UTC', activity.body.limit === 5 && typeof activity.body.total === 'number' && /Z$/.test(activity.body.events[0].at), activity.body);
  const yanActivity = await api('GET', '/auth/security-activity', { token: yan.body.accessToken });
  check("another user's activity never includes this user's events", !JSON.stringify(yanActivity.body).includes(zedEmail), yanActivity.body);

  // ── finally: confirm the current session, and it really ends ──
  const confirmed = await api('DELETE', `/auth/sessions/${currentSid}?confirmCurrent=true`, { token: t1b });
  check('with confirmation the current session ends', confirmed.status === 200 && confirmed.body.revokedCurrent === true, confirmed.body);
  const gone = await api('POST', '/auth/refresh', { body: { refreshToken: deskRefresh.body.refreshToken } });
  check('and its refresh token is dead (401)', gone.status === 401, gone.status);
}

/**
 * Slack alert delivery against a local HTTP server standing in for Slack.
 * Needs a non-production backend (it accepts http://127.0.0.1 webhook URLs there).
 * Retries use 5s/10s backoff, so the failure case takes about 20s.
 */
async function slackAlerts(A: string) {
  console.log('\n▶ Slack alerts: queue-based delivery');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require('http') as typeof import('http');
  const hits: Record<string, { count: number; body?: any }> = { '/hooks/ok': { count: 0 }, '/hooks/gone': { count: 0 } };
  const slack = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const entry = hits[req.url || ''];
      if (entry) {
        entry.count++;
        try { entry.body = JSON.parse(raw); } catch { /* ignore */ }
      }
      if (req.url === '/hooks/ok') { res.writeHead(200); res.end('ok'); }
      else { res.writeHead(404); res.end('no_service'); }
    });
  });
  await new Promise<void>((r) => slack.listen(0, '127.0.0.1', () => r()));
  const port = (slack.address() as import('net').AddressInfo).port;
  const hook = (path: string) => `http://127.0.0.1:${port}${path}`;

  try {
    const project = await newProject(A, 'Slack Project', 50);

    const noHook = await api('POST', '/api/v1/alerts', { token: A, body: { projectId: project.id, thresholdType: 'PERCENT_80' } });
    check('without a webhook the alert is IN_APP', noHook.body.alert?.status === 'IN_APP' && noHook.body.alert?.channel === 'IN_APP', noHook.body.alert);

    const bad = await api('PATCH', '/api/v1/alerts/config', { token: A, body: { projectId: project.id, slackWebhookUrl: 'https://evil.example.com/x' } });
    check('a non-Slack URL is rejected (400)', bad.status === 400, bad.status);

    const saved = await api('PATCH', '/api/v1/alerts/config', { token: A, body: { projectId: project.id, slackWebhookUrl: hook('/hooks/ok') } });
    check('webhook saved; the response never contains the URL', saved.status === 200 && saved.body.slackUrlSaved === true && !JSON.stringify(saved.body).includes('127.0.0.1'), saved.body);
    check('saved but never delivered is not "Configured" yet', saved.body.slackConfigured === false, saved.body);

    // Success path
    const t1 = await api('POST', '/api/v1/alerts', { token: A, body: { projectId: project.id, thresholdType: 'HARD_BLOCK' } });
    check('test alert is QUEUED, never SENT synchronously', t1.status === 201 && t1.body.alert?.status === 'QUEUED', t1.body.alert);
    let final = await pollAlert(A, project.id, t1.body.alert.id, 20000);
    check('worker marks it SENT after Slack answers 2xx', final?.status === 'SENT' && !!final.deliveredAt, final);
    check('Slack received Block Kit blocks (section + context)', hits['/hooks/ok'].body?.blocks?.[0]?.type === 'section' && hits['/hooks/ok'].body?.blocks?.[1]?.type === 'context', hits['/hooks/ok'].body);
    const cfgOk = await api('GET', `/api/v1/alerts/config?projectId=${project.id}`, { token: A });
    check('"Configured" once a send has succeeded', cfgOk.body.slackConfigured === true, cfgOk.body);

    // Slack answers 404: three attempts, then FAILED
    await api('PATCH', '/api/v1/alerts/config', { token: A, body: { projectId: project.id, slackWebhookUrl: hook('/hooks/gone') } });
    const t2 = await api('POST', '/api/v1/alerts', { token: A, body: { projectId: project.id, thresholdType: 'PERCENT_80' } });
    final = await pollAlert(A, project.id, t2.body.alert.id, 60000);
    check('a 404 from Slack ends as FAILED with the reason', final?.status === 'FAILED' && String(final.deliveryError).includes('404'), final);
    check('Slack was tried 3 times before giving up', hits['/hooks/gone'].count === 3, hits['/hooks/gone'].count);
    const cfgFail = await api('GET', `/api/v1/alerts/config?projectId=${project.id}`, { token: A });
    check('after a failed send it is not "Configured"', cfgFail.body.slackConfigured === false && cfgFail.body.lastSlackStatus === 'FAILED', cfgFail.body);

    const bobReg = await register('SlackBob', 'Bob Slack Org');
    const bobSet = await api('PATCH', '/api/v1/alerts/config', { token: bobReg.body.accessToken, body: { projectId: project.id, slackWebhookUrl: hook('/hooks/ok') } });
    check("another org cannot set a webhook on this project (404)", bobSet.status === 404, bobSet.status);
  } finally {
    slack.close();
  }
}

async function pollAlert(token: string, projectId: string, id: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last: any;
  while (Date.now() < deadline) {
    const r = await api('GET', `/api/v1/alerts?projectId=${projectId}`, { token });
    last = r.body.alerts?.find((a: any) => a.id === id);
    if (last && last.status !== 'QUEUED') return last;
    await new Promise((res) => setTimeout(res, 1000));
  }
  return last;
}

/**
 * Phase 8: Groq as the fourth gateway provider. Needs the backend started with
 *   GROQ_BASE_URL=<mock>/v1   and   GROQ_API_KEY=gsk_platform_...  (never to be used for tenants)
 * and a database migrated with 20261123140000_add_groq_provider.
 */
async function groqProvider(A: string) {
  const GROQ_MODEL = 'openai/gpt-oss-120b';
  const ask = (secret: string, model: string) =>
    api('POST', '/v1/chat/completions', { token: secret, body: { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 50 } });
  const addGroqKey = (projectId: string, plainKey: string) =>
    api('POST', '/api/v1/keys', { token: A, body: { type: 'PROVIDER', projectId, provider: 'GROQ', keyName: 'Groq Primary Key', plainKey } });

  console.log('\n▶ Phase 8 · Groq: no platform fallback, priced models only');
  {
    const proj = await newProject(A, 'Groq No Key', 10);
    const key = await newGatewayKey(A, proj.id);
    const before = await mockStats();
    const r = await ask(key.secret, GROQ_MODEL);
    const after = await mockStats();
    check('Groq model with no tenant key → 400 missing_provider_key', r.status === 400 && r.body.error?.code === 'missing_provider_key', r.body);
    check('missing Groq key → 0 upstream calls', after.calls === before.calls, { before, after });
    check('the Groq error names Groq, not another provider', String(r.body.error?.message).includes('Groq'), r.body.error);
    check('platform GROQ_API_KEY is never sent upstream', after.platformKeyCalls === mockAtStart.platformKeyCalls, { mockAtStart, after });
  }
  {
    const proj = await newProject(A, 'Groq Unpriced', 10);
    await addGroqKey(proj.id, 'gsk_e2e_tenant_key_1234');
    const key = await newGatewayKey(A, proj.id);
    const before = await mockStats();
    const r = await ask(key.secret, 'llama-3.3-70b-versatile');
    const after = await mockStats();
    check('unpriced Groq model → 400 model_not_priced', r.status === 400 && r.body.error?.code === 'model_not_priced', r.body);
    check('unpriced Groq model → 0 upstream calls', after.calls === before.calls, { before, after });
  }

  console.log('\n▶ Phase 8 · Groq: request, cost, limits');
  {
    const proj = await newProject(A, 'Groq Works', 10);
    const empty = await addGroqKey(proj.id, '   ');
    check('empty Groq key → 400 (nothing stored)', empty.status === 400, empty.body);
    const saved = await addGroqKey(proj.id, 'gsk_e2e_tenant_key_1234');
    check('Groq key stored (201) and only a masked preview comes back', saved.status === 201 && saved.body.provider === 'GROQ' && !JSON.stringify(saved.body).includes('gsk_e2e_tenant_key_1234'), saved.body);
    const key = await newGatewayKey(A, proj.id);
    const before = await mockStats();
    const r = await ask(key.secret, GROQ_MODEL);
    const after = await mockStats();
    check('priced Groq model succeeds through the gateway', r.status === 200 && r.body.provider === 'GROQ' && r.body.usage?.total_tokens === 1600, r.body);
    check('the request reached the Groq endpoint once', after.calls === before.calls + 1 && after.byModel[GROQ_MODEL] === (before.byModel[GROQ_MODEL] || 0) + 1, { before, after });
    // $0.15 in / $0.60 out per 1M tokens: 1200 in + 400 out = 0.00018 + 0.00024
    check('cost uses the Groq rate card', Math.abs(Number(r.headers.get('x-spendguard-cost')) - 0.00042) < 1e-9, r.headers.get('x-spendguard-cost'));

    const listed = await api('GET', `/api/v1/keys?projectId=${proj.id}`, { token: A });
    check('Key Vault lists the key as GROQ', listed.body.providerKeys?.some((k: any) => k.provider === 'GROQ'), listed.body.providerKeys);

    const noGroq = await newGatewayKey(A, proj.id, { allowedProviders: ['OPENAI'] });
    const blocked = await ask(noGroq.secret, GROQ_MODEL);
    check('a key limited to OPENAI cannot call a Groq model (403)', blocked.status === 403, blocked.body);

    const onlyGroq = await newGatewayKey(A, proj.id, { allowedProviders: ['GROQ'] });
    const allowed = await ask(onlyGroq.secret, GROQ_MODEL);
    check('a key limited to GROQ can', allowed.status === 200, allowed.body);

    // The per-key token cap is one number per gateway key (not per provider): a Groq request counts against it
    const tpmKey = await newGatewayKey(A, proj.id, { rateLimitTpm: 100 });
    const tpm = await api('POST', '/v1/chat/completions', {
      token: tpmKey.secret,
      body: { model: GROQ_MODEL, messages: [{ role: 'user', content: 'x'.repeat(6400) }], max_tokens: 50 },
    });
    check('per-key TPM applies to Groq requests (429 tpm_exceeded)', tpm.status === 429 && tpm.body.error?.code === 'tpm_exceeded', tpm.body);
  }
}

async function newProject(token: string, name: string, budgetMonthly: number, extra: Record<string, unknown> = {}) {
  const p = await api('POST', '/api/v1/projects', { token, body: { name: `${name} ${RUN}`, budgetMonthly, ...extra } });
  return p.body.project as { id: string };
}

async function addProviderKey(token: string, projectId: string) {
  await api('POST', '/api/v1/keys', {
    token,
    body: { type: 'PROVIDER', projectId, provider: 'OPENAI', keyName: 'p', plainKey: `sk-e2e-tenant-${projectId.slice(0, 8)}` },
  });
}

async function newGatewayKey(token: string, projectId: string, extra: Record<string, unknown> = {}) {
  const k = await api('POST', '/api/v1/keys', { token, body: { type: 'GATEWAY', projectId, keyName: 'k', ...extra } });
  return k.body as { id: string; secret: string };
}

async function phase1(A: string) {
  // ── P1-1. No platform provider-key fallback ──────────────────────────────
  console.log('\n▶ Phase 1 · provider keys: no platform fallback');
  {
    const proj = await newProject(A, 'No Provider Key', 10);
    const key = await newGatewayKey(A, proj.id);
    const before = await mockStats();
    const r = await api('POST', '/v1/chat/completions', { token: key.secret, body: chat('who pays?') });
    const after = await mockStats();
    check('project without provider key → 400 missing_provider_key', r.status === 400 && r.body.error?.code === 'missing_provider_key', r.body);
    check('missing provider key → 0 upstream calls', after.calls === before.calls, { before, after });
    check('platform OPENAI_API_KEY is never sent upstream (whole run)', after.platformKeyCalls === mockAtStart.platformKeyCalls, { mockAtStart, after });
  }

  // ── P1-3. Models with no price are rejected ──────────────────────────────
  console.log('\n▶ Phase 1 · pricing: unpriced models rejected');
  {
    const proj = await newProject(A, 'Unpriced Model', 10);
    await addProviderKey(A, proj.id);
    const key = await newGatewayKey(A, proj.id);
    const before = await mockStats();
    const r = await api('POST', '/v1/chat/completions', {
      token: key.secret,
      body: { model: 'o1-pro-imaginary', messages: [{ role: 'user', content: 'price me' }], max_tokens: 50 },
    });
    const after = await mockStats();
    check('unpriced model → 400 model_not_priced', r.status === 400 && r.body.error?.code === 'model_not_priced', r.body);
    check('unpriced model → 0 upstream calls', after.calls === before.calls, { before, after });
    await new Promise((res) => setTimeout(res, 500));
    const listed = (await api('GET', '/api/v1/projects', { token: A })).body.projects.find((p: any) => p.id === proj.id);
    const audit = await api('GET', `/api/v1/audit?projectId=${proj.id}`, { token: A });
    check('unpriced model → no spend recorded', Number(listed?.currentMonthlySpend) === 0 && audit.body.total === 0, { spend: listed?.currentMonthlySpend, rows: audit.body.total });
  }

  // ── P1-4. Per-request budget holds ───────────────────────────────────────
  console.log('\n▶ Phase 1 · budget holds: per request, cannot leak');
  {
    // (a) 30 parallel requests, each exactly $0.007 worst case AND actual
    //     (gpt-4o: 1200 prompt tokens ≈ 4800 chars + max_tokens 400; mock bills 1200/400).
    const proj = await newProject(A, 'Concurrency', 0.05);
    await addProviderKey(A, proj.id);
    const key = await newGatewayKey(A, proj.id);
    const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'x'.repeat(4800) }], max_tokens: 400 };
    const results = await Promise.all(
      Array.from({ length: 30 }, () => api('POST', '/v1/chat/completions', { token: key.secret, body })),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const budget429 = results.filter((r) => r.status === 429 && r.body.error?.code === 'budget_exceeded').length;
    check('30 parallel $0.007 requests on a $0.05 cap → exactly 7 succeed', ok === 7 && budget429 === 23, { ok, budget429, statuses: results.map((r) => r.status) });
    await new Promise((res) => setTimeout(res, 800));
    const listed = (await api('GET', '/api/v1/projects', { token: A })).body.projects.find((p: any) => p.id === proj.id);
    check('concurrent spend stays ≤ cap', Number(listed?.currentMonthlySpend) <= 0.05 + 1e-9, listed?.currentMonthlySpend);
  }

  // (b) and (c) drive the real Lua scripts against the suite's Redis.
  const redis = await connectRedis();
  try {
    const bucket = redis.projectMonthBucket(`e2e-holds-${RUN}`, 0.05);
    const leaked = await redis.reserveHold(`leak-${RUN}`, 0.04, [bucket], 2000); // never settled: simulated crash
    const blockedWhileHeld = await redis.reserveHold(`big1-${RUN}`, 0.02, [bucket]);
    // Steady traffic for longer than the leaked hold's lifetime
    for (let i = 0; i < 12; i++) {
      const id = `tick-${RUN}-${i}`;
      await redis.reserveHold(id, 0.0001, [bucket]);
      await redis.settleHold(id, 0.0001, [bucket]);
      await new Promise((res) => setTimeout(res, 250));
    }
    const afterExpiry = await redis.reserveHold(`big2-${RUN}`, 0.02, [bucket]);
    check('leaked hold counts while active', leaked?.status === 'reserved' && blockedWhileHeld?.status === 'rejected', { leaked, blockedWhileHeld });
    check('leaked hold stops counting after its expiry despite steady traffic', afterExpiry?.status === 'reserved', afterExpiry);

    const b2 = redis.projectMonthBucket(`e2e-dbl-${RUN}`, 1);
    await redis.reserveHold(`dbl-${RUN}`, 0.01, [b2]);
    const s1 = await redis.settleHold(`dbl-${RUN}`, 0.007, [b2]);
    const s2 = await redis.settleHold(`dbl-${RUN}`, 0.007, [b2]);
    await redis.releaseHold(`dbl-${RUN}`, [b2]);
    const spend = Number(await redis.getClient()!.get(b2.spendKey));
    check('double settle of one request ID charges once', s1?.applied === true && s2?.applied === false && Math.abs(spend - 0.007) < 1e-9, { s1, s2, spend });
    const holdsLeft = await redis.pruneExpiredHolds(b2);
    check('settle removes the hold', holdsLeft === 0, holdsLeft);

    // ── P1-5. Ledger row is written before the response ────────────────────
    console.log('\n▶ Phase 1 · ledger: written before the response');
    const proj = await newProject(A, 'Ledger Parity', 50);
    await addProviderKey(A, proj.id);
    const key = await newGatewayKey(A, proj.id);
    const N = 12;
    const res = await Promise.all(
      Array.from({ length: N }, (_, i) => api('POST', '/v1/chat/completions', { token: key.secret, body: chat(`ledger ${i}`) })),
    );
    // No sleep: once every response is back, every row must already be in Postgres.
    const audit = await api('GET', `/api/v1/audit?projectId=${proj.id}&limit=100`, { token: A });
    const dbSum = (audit.body.logs || []).reduce((s: number, l: any) => s + Number(l.costEstimate), 0);
    const redisSpend = Number(await redis.getClient()!.get(redis.projectMonthBucket(proj.id, null).spendKey));
    check(`after ${N} gateway requests every ledger row exists on response`, res.every((r) => r.status === 200) && audit.body.total === N, { statuses: res.map((r) => r.status), rows: audit.body.total });
    check('DB sum of costEstimate equals the Redis spend counter', Math.abs(dbSum - redisSpend) < 1e-9 && dbSum > 0, { dbSum, redisSpend });

    // Reconciliation must never lower Redis spend while a request is in flight.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BudgetService } = require('../src/modules/budget/budget.service');
    const pid = `e2e-recon-${RUN}`;
    const ledgerSaysOnly = {
      request: { aggregate: async () => ({ _sum: { costEstimate: 0.1 } }), groupBy: async () => [] },
      gatewayApiKey: { findMany: async () => [] },
      project: { findUnique: async () => null },
    };
    const budget = new BudgetService(ledgerSaysOnly, redis, { dispatch: async () => ({ status: "IN_APP" }) } as any);
    const rb = redis.projectMonthBucket(pid, 10);
    await redis.getClient()!.set(rb.spendKey, '0.5');
    await redis.reserveHold(`recon-${RUN}`, 0.01, [rb]);
    await budget.reconcileProjectSpend(pid);
    const whileHeld = Number(await redis.getClient()!.get(rb.spendKey));
    await redis.releaseHold(`recon-${RUN}`, [rb]);
    await budget.reconcileProjectSpend(pid);
    const afterIdle = Number(await redis.getClient()!.get(rb.spendKey));
    check('reconciliation does not lower Redis spend while holds are active', whileHeld === 0.5, whileHeld);
    check('reconciliation re-derives spend from the ledger once idle', afterIdle === 0.1, afterIdle);
  } finally {
    await redis.onModuleDestroy();
  }

  // ── P1-7. Per-key budget, per-key TPM, no phantom weekly budget ─────────
  console.log('\n▶ Phase 1 · limits that are shown are enforced');
  {
    const proj = await newProject(A, 'Key Limits', 100);
    await addProviderKey(A, proj.id);
    const big = { model: 'gpt-4o', messages: [{ role: 'user', content: 'x'.repeat(4800) }], max_tokens: 400 }; // 1600 tokens, $0.007

    const cheapKey = await newGatewayKey(A, proj.id, { budgetMonthly: 0.001 });
    const before = await mockStats();
    const overKeyBudget = await api('POST', '/v1/chat/completions', { token: cheapKey.secret, body: big });
    const after = await mockStats();
    check('key with $0.001 monthly budget + $0.007 request → 429', overKeyBudget.status === 429 && overKeyBudget.body.error?.code === 'key_budget_exceeded', overKeyBudget.body);
    check('key budget block → 0 upstream calls', after.calls === before.calls, { before, after });
    const otherKey = await newGatewayKey(A, proj.id);
    const sameProjectOtherKey = await api('POST', '/v1/chat/completions', { token: otherKey.secret, body: big });
    check('another key on the same project is not affected by that key\'s budget', sameProjectOtherKey.status === 200, sameProjectOtherKey.status);

    const tpmKey = await newGatewayKey(A, proj.id, { rateLimitTpm: 100 });
    const overTpm = await api('POST', '/v1/chat/completions', { token: tpmKey.secret, body: big });
    check('key with 100 TPM + 1,600-token request → 429 tpm_exceeded', overTpm.status === 429 && overTpm.body.error?.code === 'tpm_exceeded', overTpm.body);

    // TPM counts actual usage after settlement: each mock call really uses 1,600 tokens
    // although the pre-call estimate is ~51 (1 prompt token + max_tokens 50). With a
    // 1,610 TPM cap the 2nd call fits only if the counter was NOT corrected (51+51).
    const tpmTight = await newGatewayKey(A, proj.id, { rateLimitTpm: 1610 });
    const t1 = await api('POST', '/v1/chat/completions', { token: tpmTight.secret, body: chat('a') });
    const t2 = await api('POST', '/v1/chat/completions', { token: tpmTight.secret, body: chat('b') });
    check('TPM is corrected to actual tokens after settlement (2nd call over 1,610 TPM → 429)', t1.status === 200 && t2.status === 429 && t2.body.error?.code === 'tpm_exceeded', [t1.status, t2.status, t2.body?.error?.code]);

    const created = await api('POST', '/api/v1/projects', { token: A, body: { name: `Weekly ${RUN}`, budgetMonthly: 10, budgetWeekly: 0.001 } });
    const listedWeekly = (await api('GET', '/api/v1/projects', { token: A })).body.projects.find((p: any) => p.id === created.body.project?.id);
    // ── P1-8. Per-IP limit is abuse protection only, above key limits ──────
    console.log('\n▶ Phase 1 · per-IP gateway limit does not undercut key RPM');
    // TPM raised so only the per-IP limit could cause a 429 here (70 x 1,600 actual tokens > default 100k TPM)
    const serverApp = await newGatewayKey(A, proj.id, { rateLimitRpm: 1200, rateLimitTpm: 1000000 });
    const statuses: number[] = [];
    const codes: string[] = [];
    for (let i = 0; i < 70; i++) {
      const r = await api('POST', '/v1/chat/completions', { token: serverApp.secret, body: { ...chat(`burst ${i}`), max_tokens: 5 } });
      statuses.push(r.status);
      if (r.status === 429) codes.push(r.body.error?.code);
    }
    const perIp429 = codes.filter((c) => c === 'rate_limit_exceeded').length;
    check('key at 1,200 RPM: 70 requests in a minute from one IP → 0 per-IP 429s', perIp429 === 0 && statuses.every((s) => s === 200), { perIp429, statuses: statuses.join(',') });

    // ── P1-9. Test alerts are honest about delivery ─────────────────────────
    const fake = await api('POST', '/api/v1/alerts', { token: A, body: { projectId: proj.id, thresholdType: 'ANOMALY_DETECTED', channel: 'SLACK' } });
    const fa = fake.body.alert;
    check('test alert is IN_APP without a webhook (nothing was delivered), no invented spike stats', fake.status === 201 && fa?.channel === 'IN_APP' && fa?.status === 'IN_APP' && !/3\.4x|7-day/.test(fa?.message || ''), fa);
    check('unenforced weekly budget is not accepted or returned by the API', created.status === 201 && created.body.project?.budgetWeekly === undefined && listedWeekly && listedWeekly.budgetWeekly === undefined, { created: created.body.project, listed: listedWeekly });
  }

  // ── P1-10. Prompt privacy ────────────────────────────────────────────────
  console.log('\n▶ Phase 1 · prompt privacy');
  {
    const secret = `SECRET-PROMPT-${RUN}`;
    const proj = await newProject(A, 'Private By Default', 10);
    await addProviderKey(A, proj.id);
    const key = await newGatewayKey(A, proj.id);
    const r = await api('POST', '/v1/chat/completions', { token: key.secret, body: chat(secret) });
    const audit = await api('GET', `/api/v1/audit?projectId=${proj.id}`, { token: A });
    check('default project: request succeeds and is audited', r.status === 200 && audit.body.total === 1, { status: r.status, total: audit.body.total });
    check('default project: audit log contains no prompt text', !JSON.stringify(audit.body).includes(secret) && audit.body.logs?.[0]?.promptPreview == null, audit.body.logs?.[0]);

    const optIn = await newProject(A, 'Logs Content', 10, { logRequestContent: true });
    await addProviderKey(A, optIn.id);
    const optKey = await newGatewayKey(A, optIn.id);
    const secret2 = `OPTIN-PROMPT-${RUN}`;
    await api('POST', '/v1/chat/completions', { token: optKey.secret, body: chat(secret2) });
    const ownerView = await api('GET', `/api/v1/audit?projectId=${optIn.id}`, { token: A });
    check('logRequestContent=true: OWNER sees the stored preview', ownerView.body.logs?.[0]?.promptPreview?.includes(secret2), ownerView.body.logs?.[0]);

    const memberEmail = `dana.${RUN}@e2e.spendguard.test`;
    const inv = await api('POST', '/api/v1/team', { token: A, body: { name: 'Dana', email: memberEmail, role: 'MEMBER' } });
    await api('POST', '/auth/reset-password', { body: { token: await findPasswordToken(memberEmail), newPassword: 'DanasOwnPass#1' } });
    const dana = await api('POST', '/auth/login', { body: { email: memberEmail, password: 'DanasOwnPass#1' } });
    const memberView = await api('GET', `/api/v1/audit?projectId=${optIn.id}`, { token: dana.body.accessToken });
    check('MEMBER never receives prompt/response previews', memberView.status === 200 && memberView.body.total === 1 && !JSON.stringify(memberView.body).includes(secret2), memberView.body.logs?.[0]);
  }

  // ── P1-11. Auth routes are rate limited ──────────────────────────────────
  console.log('\n▶ Phase 1 · auth rate limits');
  {
    const victim = await register('Victim', `Victim ${RUN}`);
    const attempts: ApiResult[] = [];
    for (let i = 0; i < 6; i++) {
      attempts.push(await api('POST', '/auth/login', { body: { email: victim.email, password: `wrong-${i}` } }));
    }
    const statuses = attempts.map((r) => r.status);
    const last = attempts[5];
    check('6 failed logins for one email in a minute → first 5 are 401, 6th is 429', statuses.slice(0, 5).every((s) => s === 401) && last.status === 429, statuses);
    check('auth 429 uses the flat error shape', typeof last.body.error?.message === 'string' && last.body.error?.code === 'auth_rate_limited', last.body);
  }
}

/** Finds the one-time password-set token issued for an email (it is only ever emailed). */
async function findPasswordToken(email: string): Promise<string | undefined> {
  const redis = await connectRedis();
  try {
    const client = redis.getClient();
    if (!client) return undefined;
    const keys = await client.keys('spendguard:pwd_reset:*');
    for (const key of keys) {
      const raw = await client.get(key);
      if (raw && JSON.parse(raw).email === email) return key.slice('spendguard:pwd_reset:'.length);
    }
    return undefined;
  } finally {
    await redis.onModuleDestroy?.();
  }
}

/** A RedisService connected to the same Redis as the backend under test. */
async function connectRedis() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RedisService } = require('../src/modules/redis/redis.service');
  const cfg: Record<string, unknown> = {
    'redis.host': process.env.E2E_REDIS_HOST || 'localhost',
    'redis.port': Number(process.env.E2E_REDIS_PORT || 6379),
    'redis.password': process.env.E2E_REDIS_PASSWORD || undefined,
  };
  const svc = new RedisService({ get: (k: string) => cfg[k] });
  await svc.onModuleInit();
  for (let i = 0; i < 50 && !svc.isConnected; i++) await new Promise((r) => setTimeout(r, 100));
  return svc as import('../src/modules/redis/redis.service').RedisService;
}

run().catch((err) => {
  console.error('E2E suite crashed:', err);
  process.exit(1);
});
