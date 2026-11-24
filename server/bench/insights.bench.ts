/**
 * Cost Insights benchmark against a THROWAWAY Postgres (never point this at a real database: it seeds millions of rows).
 *
 *   BENCH_DATABASE_URL=postgresql://... npx ts-node -r tsconfig-paths/register bench/insights.bench.ts [10000,100000,1000000]
 *
 * It drives the real service classes (the same code the HTTP endpoints call) over real Postgres and reports, per dataset
 * size and per endpoint: p50/p95/p99 latency, database queries per call, memory growth, and EXPLAIN (ANALYZE, BUFFERS)
 * for every distinct query at the largest size. Results are written to docs/benchmarks/. Nothing here is a claim about
 * production: it is one machine, one Postgres configuration, one synthetic distribution (documented in the output).
 */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { InsightsDataService } from '../src/modules/insights/insights.data';
import { AttributionService } from '../src/modules/insights/attribution.service';
import { ForecastService } from '../src/modules/insights/forecast.service';
import { InvestigationService } from '../src/modules/insights/investigation.service';
import { ModelComparisonService } from '../src/modules/insights/model-comparison.service';
import { RecommendationsService } from '../src/modules/insights/recommendations.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { RollupService } from '../src/modules/insights/rollup.service';

const URL = process.env.BENCH_DATABASE_URL;
if (!URL || /spendguard|prod/i.test(URL)) {
  console.error('Set BENCH_DATABASE_URL to a throwaway database (its name must not contain "spendguard" or "prod").');
  process.exit(2);
}
const SIZES = (process.argv[2] ?? '10000,100000,1000000').split(',').map(Number);
const ITER = (n: number) => (n >= 1_000_000 ? 15 : 30);

const prisma = new PrismaClient({ datasources: { db: { url: URL } }, log: [{ emit: 'event', level: 'query' }] });
let queryLog: Array<{ query: string; params: string; ms: number }> = [];
(prisma as any).$on('query', (e: any) => queryLog.push({ query: e.query, params: e.params, ms: Number(e.duration) }));

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};
const mb = (b: number) => Math.round((b / 1024 / 1024) * 10) / 10;

async function seed(orgId: string, projects: string[], keys: string[], noiseOrg: string, noiseProject: string, target: number) {
  const have = Number((await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*)::bigint AS n FROM requests'))[0].n);
  let remaining = target - have;
  const BATCH = 250_000;
  while (remaining > 0) {
    const n = Math.min(BATCH, remaining);
    const t0 = Date.now();
    // Skewed project/model/application choice, 60 days of history with a denser last day, lognormal-ish tokens, 2% blocked.
    await prisma.$executeRawUnsafe(
      `
      WITH g AS (
        SELECT i,
               random() AS r1, random() AS r2, random() AS r3, random() AS r4, random() AS r5, random() AS r6, random() AS r7
        FROM generate_series(1, ${n}) i
      ), s AS (
        SELECT i,
               CASE WHEN r7 < 0.97 THEN (ARRAY[${projects.map((p) => `'${p}'`).join(',')}])[1 + floor(power(r1, 2.2) * ${projects.length})::int]
                    ELSE '${noiseProject}' END AS project_id,
               (ARRAY['gpt-4o','gpt-4o-mini','claude-3-5-sonnet','gemini-1.5-flash','llama-3.1-70b','gpt-4.1'])[1 + floor(power(r2, 1.8) * 6)::int] AS model,
               (200 + 3000 * power(r3, 3))::int AS tin,
               (50 + 800 * power(r4, 2))::int AS tout,
               CASE WHEN r5 < 0.25 THEN NULL ELSE (ARRAY['support-bot','search','billing-api','batch-jobs','pricing-page'])[1 + floor(random() * 5)::int] END AS app,
               CASE WHEN r6 < 0.30 THEN NULL ELSE (ARRAY['platform','growth','finance','ml'])[1 + floor(random() * 4)::int] END AS team,
               CASE WHEN r5 > 0.9 THEN (ARRAY[${keys.map((k) => `'${k}'`).join(',')}])[1 + floor(random() * ${keys.length})::int] ELSE NULL END AS key_id,
               CASE WHEN r6 > 0.9 THEN now() - (r3 * interval '1 day') ELSE now() - (r4 * interval '60 days') END AS ts,
               (r1 < 0.02) AS blocked
        FROM g
      )
      INSERT INTO requests (id, project_id, gateway_key_id, provider, model, tokens_in, tokens_out, total_tokens, cost_estimate, latency_ms,
                            status_code, is_blocked, anomaly_status, application, team, cached_tokens_in, created_at)
      SELECT 'bench_' || substr(md5(random()::text || i::text), 1, 20) || '_' || i, project_id, key_id,
             (CASE WHEN model LIKE 'gpt%' THEN 'OPENAI' WHEN model LIKE 'claude%' THEN 'ANTHROPIC' WHEN model LIKE 'gemini%' THEN 'GEMINI' ELSE 'GROQ' END)::"ProviderType",
             model, tin, tout, tin + tout,
             round(((tin * (CASE model WHEN 'gpt-4o' THEN 2.5 WHEN 'gpt-4.1' THEN 2 WHEN 'claude-3-5-sonnet' THEN 3 ELSE 0.15 END) +
                     tout * (CASE model WHEN 'gpt-4o' THEN 10 WHEN 'gpt-4.1' THEN 8 WHEN 'claude-3-5-sonnet' THEN 15 ELSE 0.6 END)) / 1000000.0)::numeric, 6),
             200 + (random() * 1500)::int, CASE WHEN blocked THEN 429 ELSE 200 END, blocked, CASE WHEN blocked THEN 'SKIPPED' ELSE 'CLEAR' END,
             app, team, CASE WHEN random() < 0.5 THEN (tin * random() * 0.4)::int ELSE NULL END, ts
      FROM s`,
    );
    remaining -= n;
    console.log(`  seeded ${n.toLocaleString()} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  // Other tenant's data must exist so org filtering is actually exercised
  const dels = Math.max(1000, Math.floor(target / 10));
  const haveDel = Number((await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::bigint AS n FROM notification_deliveries WHERE org_id = '${orgId}'`))[0].n);
  if (haveDel < dels) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO notification_deliveries (id, org_id, channel_id, channel_type, event_id, event_type, status, attempts, payload, in_app_key, created_at)
       SELECT gen_random_uuid()::text, '${orgId}', NULL, 'IN_APP', 'ev' || i, 'budget.alert', 'SENT', 1, '{"title":"t"}'::jsonb, '${orgId}:ev' || i || '_' || ${have}, now() - (random() * interval '60 days')
       FROM generate_series(1, ${dels - haveDel}) i`,
    );
  }
  await prisma.$executeRawUnsafe('ANALYZE requests');
  await prisma.$executeRawUnsafe('ANALYZE notification_deliveries');
  void noiseOrg;
}

function explainSql(q: { query: string; params: string }) {
  let params: unknown[] = [];
  try {
    params = JSON.parse(q.params);
  } catch {
    /* none */
  }
  let sql = q.query;
  for (let i = params.length; i >= 1; i--) {
    const v = params[i - 1];
    const lit = typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
    sql = sql.split(`$${i}`).join(lit);
  }
  return `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`;
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  const log = (s = '') => {
    console.log(s);
    out.push(s);
  };

  const KEEP = process.env.BENCH_KEEP === '1'; // re-measure the existing dataset (e.g. with BENCH_ROLLUPS=on) instead of reseeding
  const useRollups = process.env.BENCH_ROLLUPS === 'on';
  if (useRollups) process.env.INSIGHTS_ROLLUPS = 'on';
  const rollupSvc = new RollupService(prisma as any);
  const data = new InsightsDataService(prisma as any, useRollups ? rollupSvc : undefined);
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);
  const attribution = new AttributionService(data);
  const forecasts = new ForecastService(data, prisma as any);
  const investigations = new InvestigationService(data);
  const comparison = new ModelComparisonService(data, pricing);
  const notifications = new NotificationsService(prisma as any, { hashToken: (s: string) => s, encryptApiKey: (s: string) => s, decryptApiKey: (s: string) => s } as any, { add: async () => ({}) } as any);
  const recommendations = new RecommendationsService(prisma as any, data, forecasts, investigations, comparison, notifications);

  // ── fixtures ──
  let orgId: string = randomUUID();
  const noiseOrg: string = randomUUID();
  let projects: string[] = Array.from({ length: 8 }, () => randomUUID());
  const noiseProject: string = randomUUID();
  const keys: string[] = Array.from({ length: 20 }, () => randomUUID());
  if (KEEP) {
    const org = await prisma.organization.findFirstOrThrow({ where: { name: 'Bench' } });
    orgId = org.id;
    projects = (await prisma.project.findMany({ where: { orgId }, orderBy: { slug: 'asc' } })).map((p) => p.id);
    console.log(`Keeping the existing dataset (${projects.length} projects)`);
  } else {
  await prisma.$executeRawUnsafe('TRUNCATE request_daily_rollups, rollup_state, requests, notification_deliveries, recommendations, gateway_api_keys, projects, organizations CASCADE');
  await prisma.organization.createMany({ data: [{ id: orgId, name: 'Bench', slug: `b-${orgId}` }, { id: noiseOrg, name: 'Noise', slug: `n-${noiseOrg}` }] });
  await prisma.project.createMany({ data: [...projects.map((id, i) => ({ id, orgId, name: `Project ${i}`, slug: `p${i}`, budgetMonthly: 5000 })), { id: noiseProject, orgId: noiseOrg, name: 'Noise', slug: 'noise' }] });
  await prisma.gatewayApiKey.createMany({ data: keys.map((id, i) => ({ id, projectId: projects[i % projects.length], keyName: `k${i}`, keyPrefix: 'sg_live', hashedSecret: `h${id}` })) });
  await prisma.recommendation.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({ orgId, projectId: projects[i % 8], fingerprint: `bench:${i}`, type: 'SPEND_INCREASE', status: 'OPEN', severity: 'warning', title: 't', summary: 's', evidence: {}, method: 'm', impactBasis: 'b', confidence: 'medium', action: 'a', requiresApproval: false, firstSeenAt: new Date(), lastSeenAt: new Date() } as any)),
  }).catch((e) => console.warn('recommendation fixture skipped:', String(e.message).split('\n').pop()));
  }
  if (useRollups) {
    for (let i = 0; i < 6; i++) {
      const t0 = Date.now();
      const r = await rollupSvc.build(new Date());
      console.log(`rollup build: ${r.rebuilt} days in ${((Date.now() - t0) / 1000).toFixed(1)}s, through ${r.completeThrough}`);
      if ((r as any).caughtUp) break;
    }
    const t1 = Date.now();
    const rec = await rollupSvc.reconcile(new Date());
    console.log(`rollup reconcile over the ledger: ${rec.discrepancies.length} discrepancies, ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  }

  const endpoints: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: 'attribution by model (org, 30d)', run: () => attribution.attribute(orgId, { dimension: 'model', from: new Date(Date.now() - 30 * 86400000).toISOString() }) },
    { name: 'attribution by application (org, 30d)', run: () => attribution.attribute(orgId, { dimension: 'application', from: new Date(Date.now() - 30 * 86400000).toISOString() }) },
    { name: 'attribution by key (org, 30d)', run: () => attribution.attribute(orgId, { dimension: 'key', from: new Date(Date.now() - 30 * 86400000).toISOString() }) },
    { name: 'attribution by model (1 project, 30d)', run: () => attribution.attribute(orgId, { dimension: 'model', projectId: projects[0], from: new Date(Date.now() - 30 * 86400000).toISOString() }) },
    { name: 'investigation 24h vs 7d (org)', run: () => investigations.investigate(orgId, { from: new Date(Date.now() - 86400000).toISOString() }) },
    { name: 'investigation 24h vs 7d (1 project)', run: () => investigations.investigate(orgId, { projectId: projects[0], from: new Date(Date.now() - 86400000).toISOString() }) },
    { name: 'investigation 30d vs 7d (org)', run: () => investigations.investigate(orgId, { from: new Date(Date.now() - 30 * 86400000).toISOString() }) },
    { name: 'forecast (org)', run: () => forecasts.forecast(orgId) },
    { name: 'forecast (1 project)', run: () => forecasts.forecast(orgId, projects[0]) },
    { name: 'model comparison 30d (org)', run: () => comparison.compare(orgId, { days: 30 }) },
    { name: 'model comparison 30d (1 project)', run: () => comparison.compare(orgId, { projectId: projects[0], days: 30 }) },
    { name: 'recommendations list', run: () => recommendations.list(orgId, {}) },
    { name: 'notification history (50)', run: () => notifications.deliveries(orgId, { limit: 50 }) },
    { name: 'inbox page (20) + unread count', run: () => Promise.all([notifications.inbox(orgId, false, { limit: 20 }), notifications.unreadCount(orgId)]) },
  ];

  log(`# Cost Insights benchmark (${stamp})${useRollups ? ' — daily rollups ON' : ''}`);
  log();
  log(`Environment: node ${process.version}, ${process.platform}; Postgres ${(await prisma.$queryRawUnsafe<any[]>('SHOW server_version'))[0].server_version}, shared_buffers=${(await prisma.$queryRawUnsafe<any[]>('SHOW shared_buffers'))[0].shared_buffers}, work_mem=${(await prisma.$queryRawUnsafe<any[]>('SHOW work_mem'))[0].work_mem}. Single machine, Postgres in Docker, the benchmark and database share CPU. **These numbers describe this environment only.**`);
  log('Data: synthetic. 8 projects (skewed: the busiest holds roughly 40% of rows), 6 models (skewed), 5 applications + 25% unattributed, 4 teams + 30% unattributed, 20 gateway keys on 10% of rows, 60 days of history with a denser last day, 2% blocked, plus a second organization holding ~3% of rows. Warm cache (each endpoint is run once untimed first).');
  log();

  const results: Record<number, Record<string, { p50: number; p95: number; p99: number; max: number; queries: number; dbMs: number; heapMb: number }>> = {};
  let lastSamples = new Map<string, { query: string; params: string; ms: number; endpoint: string }>();

  for (const size of SIZES) {
    log(`## ${size.toLocaleString()} request rows`);
    console.log(`Seeding to ${size.toLocaleString()} rows…`);
    if (!KEEP) await seed(orgId, projects, keys, noiseOrg, noiseProject, size);
    results[size] = {};
    log();
    log('| endpoint | p50 ms | p95 ms | p99 ms | max ms | DB queries/call | DB time/call ms | heap Δ MB |');
    log('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const ep of endpoints) {
      await ep.run(); // warm-up, untimed
      const lat: number[] = [];
      let q = 0;
      let dbMs = 0;
      let heapPeak = 0;
      const iters = ITER(size);
      for (let i = 0; i < iters; i++) {
        (global as any).gc?.();
        const before = process.memoryUsage().heapUsed;
        queryLog = [];
        const t0 = process.hrtime.bigint();
        await ep.run();
        lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
        heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed - before);
        q += queryLog.length;
        dbMs += queryLog.reduce((a, x) => a + x.ms, 0);
        if (size === SIZES[SIZES.length - 1] && i === 0) for (const x of queryLog) lastSamples.set(`${ep.name}::${x.query.replace(/\$\d+/g, '?').slice(0, 300)}`, { ...x, endpoint: ep.name });
      }
      const r = { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: Math.max(...lat), queries: q / iters, dbMs: dbMs / iters, heapMb: mb(heapPeak) };
      results[size][ep.name] = r;
      log(`| ${ep.name} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.p99.toFixed(1)} | ${r.max.toFixed(1)} | ${r.queries.toFixed(0)} | ${r.dbMs.toFixed(1)} | ${r.heapMb} |`);
    }
    log();
    log(`Iterations per endpoint: ${ITER(size)} (so p99 is effectively the max of ${ITER(size)} samples).`);
    log();
  }

  // ── query plans at the largest size ──
  const biggest = SIZES[SIZES.length - 1];
  log(`## Query plans at ${biggest.toLocaleString()} rows (EXPLAIN ANALYZE, BUFFERS; one per distinct query)`);
  log();
  const seen = new Set<string>();
  for (const [, s] of lastSamples) {
    const shape = s.query.replace(/\$\d+/g, '?');
    if (seen.has(shape) || /^\s*(BEGIN|COMMIT)/i.test(s.query) || !/requests|notification_deliveries|projects/i.test(s.query)) continue;
    seen.add(shape);
    try {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(explainSql(s));
      const plan = rows.map((r) => Object.values(r)[0]).join('\n');
      const exec = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1];
      log(`### ${s.endpoint}: ${exec ?? '?'} ms`);
      log('```sql');
      log(s.query.replace(/\s+/g, ' ').slice(0, 400));
      log('```');
      log('```');
      log(plan.split('\n').slice(0, 40).join('\n'));
      log('```');
      log();
    } catch (e: any) {
      log(`### ${s.endpoint}: EXPLAIN unavailable (${String(e.message).split('\n').pop()?.slice(0, 120)})`);
      log();
    }
  }

  const dir = join(__dirname, '..', '..', 'docs', 'benchmarks');
  mkdirSync(dir, { recursive: true });
  const suffix = useRollups ? '-rollups' : '';
  writeFileSync(join(dir, `insights-${stamp}${suffix}.md`), out.join('\n') + '\n');
  writeFileSync(join(dir, `insights-${stamp}${suffix}.json`), JSON.stringify({ sizes: SIZES, results }, null, 2));
  console.log(`\nWritten to docs/benchmarks/insights-${stamp}${suffix}.md`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
