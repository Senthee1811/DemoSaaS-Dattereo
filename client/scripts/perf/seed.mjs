/**
 * Seeds a THROWAWAY stack for repeatable frontend measurements: one organization with an owner, 3 projects, provider and
 * gateway keys, a few real gateway calls through the mock provider, and ~30 days of historical ledger rows so the charts,
 * forecast and investigation have data. Never point it at a real backend.
 *
 *   node scripts/perf/seed.mjs            (API at PERF_API, default http://localhost:4800; Postgres container PERF_PG)
 *
 * Writes scripts/perf/.session.json (access/refresh tokens + user) for measure.mjs. That file is git-ignored.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.PERF_API || 'http://localhost:4800';
const PG = process.env.PERF_PG || 'sg-perf-pg';
const here = dirname(fileURLToPath(import.meta.url));
const RUN = Date.now().toString(36);

if (!/localhost|127\.0\.0\.1/.test(API)) throw new Error('refusing to seed a non-local API');

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
}

const email = `perf.${RUN}@perf.spendguard.test`;
const reg = await api('POST', '/auth/register', { body: { email, password: 'CorrectHorse!42', name: 'Perf Owner', orgName: `Perf Org ${RUN}` } });
if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${reg.text}`);
const token = reg.body.accessToken;

const projects = [];
for (const [i, name] of ['Support Copilot', 'Search', 'Batch Jobs'].entries()) {
  const p = await api('POST', '/api/v1/projects', { token, body: { name, budgetMonthly: 500 + i * 250 } });
  const projectId = p.body.project.id;
  await api('POST', '/api/v1/keys', { token, body: { type: 'PROVIDER', projectId, provider: 'OPENAI', keyName: 'k', plainKey: 'sk-goodkey-abcdefghijklmnop' } });
  const gw = await api('POST', '/api/v1/keys', { token, body: { type: 'GATEWAY', projectId, keyName: `app-${i}`, application: ['support-bot', 'search', 'batch-jobs'][i], team: ['platform', 'growth', 'ml'][i] } });
  projects.push({ projectId, name, secret: gw.body.secret });
}
for (const p of projects) {
  for (let i = 0; i < 12; i++) {
    const r = await api('POST', '/v1/chat/completions', { token: p.secret, body: { model: i % 3 ? 'gpt-4o-mini' : 'gpt-4o', messages: [{ role: 'user', content: `perf seed ${i}` }], max_tokens: 40 } });
    if (r.status !== 200) throw new Error(`gateway call failed: ${r.status} ${r.text.slice(0, 200)}`);
  }
}

// Historical ledger rows (SQL, inside the throwaway container only)
const ids = projects.map((p) => `'${p.projectId}'`).join(',');
const sql = `
INSERT INTO requests (id, project_id, provider, model, tokens_in, tokens_out, total_tokens, cost_estimate, latency_ms, status_code, is_blocked, anomaly_status, application, team, usage_status, created_at)
SELECT 'perf_' || md5(random()::text || i::text), (ARRAY[${ids}])[1 + (i % 3)], 'OPENAI'::"ProviderType",
       (ARRAY['gpt-4o','gpt-4o-mini','gpt-4.1'])[1 + (i % 3)], 400 + (i % 900), 80 + (i % 300), 480 + (i % 1200),
       round((0.0005 + (i % 40) * 0.0004)::numeric, 6), 300 + (i % 700), 200, false, 'CLEAR',
       (ARRAY['support-bot','search','batch-jobs', NULL])[1 + (i % 4)], (ARRAY['platform','growth','ml', NULL])[1 + (i % 4)], 'CONFIRMED',
       now() - ((i % 30) * interval '1 day') - ((i % 24) * interval '1 hour')
FROM generate_series(1, 6000) i;`;
execFileSync('docker', ['exec', '-i', PG, 'psql', '-U', 'sg', '-d', 'perf', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' });

const login = await api('POST', '/auth/login', { body: { email, password: 'CorrectHorse!42' } });
const session = { email, password: 'CorrectHorse!42', accessToken: login.body.accessToken ?? token, refreshToken: login.body.refreshToken ?? reg.body.refreshToken, user: login.body.user ?? reg.body.user, projects: projects.map((p) => ({ id: p.projectId, name: p.name })) };
writeFileSync(join(here, '.session.json'), JSON.stringify(session, null, 2));
console.log(`seeded org with ${projects.length} projects; session written`);
