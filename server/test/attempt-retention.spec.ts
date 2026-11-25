import 'reflect-metadata';
import { AttemptRetentionService } from '../src/modules/gateway/attempt-retention.service';

const DAY = 86_400_000;
const NOW = new Date('2026-11-25T12:00:00Z');
const old = (days: number) => new Date(NOW.getTime() - days * DAY);

type Row = { id: string; createdAt: Date; billingStatus: string | null; reconciledStatus: string | null };

/** A tiny evaluator for exactly the where-clauses the service sends. The ledger table is deliberately absent: touching it would throw. */
function fake(rows: Row[]) {
  const audit: any[] = [];
  const match = (r: Row, w: any): boolean => {
    if (w.id?.in && !w.id.in.includes(r.id)) return false;
    if (w.createdAt?.lt && !(r.createdAt < w.createdAt.lt)) return false;
    if (w.OR && !w.OR.some((c: any) => Object.entries(c).every(([k, v]) => (r as any)[k] === v))) return false;
    if (w.NOT) {
      const terms = Array.isArray(w.NOT) ? w.NOT : [w.NOT];
      for (const t of terms) {
        const hit = Object.entries(t).every(([k, v]: [string, any]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes((r as any)[k]) : (r as any)[k] === v));
        if (hit) return false;
      }
    }
    return true;
  };
  const prisma: any = {
    requestAttempt: {
      findMany: jest.fn(async ({ where, take }: any) => rows.filter((r) => match(r, where)).slice(0, take).map((r) => ({ id: r.id }))),
      deleteMany: jest.fn(async ({ where }: any) => {
        const del = rows.filter((r) => match(r, where));
        del.forEach((d) => rows.splice(rows.indexOf(d), 1));
        return { count: del.length };
      }),
    },
    auditLog: { create: jest.fn(async ({ data }: any) => (audit.push(data), data)) },
  };
  return { svc: new AttemptRetentionService(prisma), rows, audit, prisma };
}

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

const mixed = (): Row[] => [
  { id: 'rejected-old', createdAt: old(200), billingStatus: 'NOT_EXPECTED', reconciledStatus: null },
  { id: 'rejected-recent', createdAt: old(10), billingStatus: 'NOT_EXPECTED', reconciledStatus: null },
  { id: 'uncertain-old-open', createdAt: old(900), billingStatus: 'UNCERTAIN', reconciledStatus: null },
  { id: 'likely-old-open', createdAt: old(900), billingStatus: 'LIKELY_CHARGED', reconciledStatus: null },
  { id: 'uncertain-old-notcharged', createdAt: old(300), billingStatus: 'UNCERTAIN', reconciledStatus: 'NOT_CHARGED_CONFIRMED' },
  { id: 'uncertain-old-charged', createdAt: old(900), billingStatus: 'UNCERTAIN', reconciledStatus: 'CHARGED_CONFIRMED' },
  { id: 'legacy-unclassified', createdAt: old(900), billingStatus: null, reconciledStatus: null },
];

describe('request-attempt retention', () => {
  it('is OFF by default: nothing is read or deleted', async () => {
    delete process.env.ATTEMPT_RETENTION_DAYS;
    const { svc, rows, prisma } = fake(mixed());
    expect(await svc.purge(NOW)).toEqual({ enabled: false, deleted: 0, cutoff: null });
    expect(prisma.requestAttempt.findMany).not.toHaveBeenCalled();
    expect(rows).toHaveLength(7);
  });

  it.each([['abc'], ['-5'], ['0'], ['']])('an invalid or non-positive setting (%j) keeps everything', async (v) => {
    process.env.ATTEMPT_RETENTION_DAYS = v;
    expect(AttemptRetentionService.days()).toBe(0);
  });

  it('a very short period is raised to 30 days so a typo cannot wipe recent evidence', () => {
    process.env.ATTEMPT_RETENTION_DAYS = '1';
    expect(AttemptRetentionService.days()).toBe(30);
  });

  it('deletes only what can no longer represent money: old "no charge expected" and old human-confirmed "not charged"', async () => {
    process.env.ATTEMPT_RETENTION_DAYS = '90';
    const { svc, rows } = fake(mixed());
    const out = await svc.purge(NOW);
    expect(out.deleted).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual(['legacy-unclassified', 'likely-old-open', 'rejected-recent', 'uncertain-old-charged', 'uncertain-old-open']);
  });

  it('NEVER deletes open exposure, confirmed charges, unclassified legacy rows or anything newer than the cutoff, however old', async () => {
    process.env.ATTEMPT_RETENTION_DAYS = '30';
    const { svc, rows } = fake(mixed().map((r) => ({ ...r, createdAt: old(5000) })));
    await svc.purge(NOW);
    const left = rows.map((r) => r.id);
    for (const keep of ['uncertain-old-open', 'likely-old-open', 'uncertain-old-charged', 'legacy-unclassified']) expect(left).toContain(keep);
  });

  it('works in bounded batches and stops at the batch limit', async () => {
    process.env.ATTEMPT_RETENTION_DAYS = '30';
    const many: Row[] = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, createdAt: old(400), billingStatus: 'NOT_EXPECTED', reconciledStatus: null }));
    const { svc, rows, prisma } = fake(many);
    const out = await svc.purge(NOW, { batchSize: 10, maxBatches: 2 });
    expect(out.deleted).toBe(20);
    expect(rows).toHaveLength(5);
    expect(prisma.requestAttempt.deleteMany).toHaveBeenCalledTimes(2);
    expect((await svc.purge(NOW, { batchSize: 10, maxBatches: 2 })).deleted).toBe(5); // the next run finishes the job
  });

  it('records each purge in the audit trail (counts and cutoff only) and writes no audit row when nothing was deleted', async () => {
    process.env.ATTEMPT_RETENTION_DAYS = '90';
    const { svc, audit } = fake(mixed());
    await svc.purge(NOW);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: 'system', action: 'attempts.retention_purged' });
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ deleted: 2, retentionDays: 90 });
    await svc.purge(NOW);
    expect(audit).toHaveLength(1);
  });

  it('never touches the spend ledger (the fake has no `request` model, so any access would throw)', async () => {
    process.env.ATTEMPT_RETENTION_DAYS = '30';
    const { svc } = fake(mixed());
    await expect(svc.purge(NOW)).resolves.toBeDefined();
  });

  it('a failed audit write is logged but does not undo or fail the purge', async () => {
    process.env.ATTEMPT_RETENTION_DAYS = '90';
    const { svc, prisma } = fake(mixed());
    prisma.auditLog.create = jest.fn(async () => {
      throw new Error('audit db down');
    });
    await expect(svc.purge(NOW)).resolves.toMatchObject({ deleted: 2 });
  });
});
