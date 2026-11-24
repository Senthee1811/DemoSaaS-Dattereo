/**
 * Small in-memory doubles shared by the reliability tests. They implement the Prisma filter operators the
 * production code actually uses (equals, in, not, lt, lte, gte, gt, OR) so status transitions, sweeps and
 * duplicate handling run against real filtering logic instead of canned return values.
 */

export type Row = Record<string, any>;

function matchesValue(actual: any, cond: any): boolean {
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    if ('in' in cond && !cond.in.includes(actual)) return false;
    if ('not' in cond && actual === cond.not) return false;
    const cmp = (a: any, b: any) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : a - b);
    if ('lt' in cond && !(actual != null && cmp(actual, cond.lt) < 0)) return false;
    if ('lte' in cond && !(actual != null && cmp(actual, cond.lte) <= 0)) return false;
    if ('gt' in cond && !(actual != null && cmp(actual, cond.gt) > 0)) return false;
    if ('gte' in cond && !(actual != null && cmp(actual, cond.gte) >= 0)) return false;
    return true;
  }
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
  return actual === cond;
}

export function matches(row: Row, where: Row = {}): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(v as Row[]).some((w) => matches(row, w))) return false;
    } else if (k === 'AND') {
      if (!(v as Row[]).every((w) => matches(row, w))) return false;
    } else if (!matchesValue(row[k], v)) return false;
  }
  return true;
}

/** The slice of `prisma.request` / `prisma.budgetAlert` / `prisma.requestAttempt` the reliability code touches. */
export class FakeDb {
  requests = new Map<string, Row>();
  alerts: Row[] = [];
  attempts: Row[] = [];
  /** Make the next N `request.updateMany` calls throw (simulates a DB error / process crash mid-job). */
  failUpdateManyTimes = 0;
  updateManyCalls = 0;
  now = () => Date.now();

  addRequest(r: Row) {
    const row: Row = {
      isBlocked: false,
      isAnomaly: false,
      anomalyReason: null,
      anomalyStatus: 'PENDING',
      anomalyEvaluatedAt: null,
      costEstimate: 0.005,
      totalTokens: 400,
      model: 'gpt-4o',
      projectId: 'proj-a',
      createdAt: new Date(this.now()),
      ...r,
    };
    this.requests.set(row.id, row);
    return row;
  }

  request = {
    findUnique: async ({ where, select }: any) => {
      const r = this.requests.get(where.id);
      if (!r) return null;
      return select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : { ...r };
    },
    findMany: async ({ where, orderBy, take, select }: any = {}) => {
      let rows = [...this.requests.values()].filter((r) => matches(r, where));
      if (orderBy?.createdAt) rows.sort((a, b) => (orderBy.createdAt === 'desc' ? -1 : 1) * (a.createdAt.getTime() - b.createdAt.getTime()));
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k]])) : { ...r }));
    },
    updateMany: async ({ where, data }: any) => {
      this.updateManyCalls++;
      if (this.failUpdateManyTimes > 0) {
        this.failUpdateManyTimes--;
        throw new Error('db connection lost');
      }
      let count = 0;
      for (const r of this.requests.values()) {
        if (matches(r, where)) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    },
  };

  budgetAlert = {
    findFirst: async ({ where }: any) => this.alerts.find((a) => matches(a, where)) ?? null,
  };

  requestAttempt = {
    create: async ({ data }: any) => {
      if (this.attempts.some((a) => a.id === data.id)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      this.attempts.push({ ...data });
      return data;
    },
    findMany: async ({ where, orderBy, take, skip, include }: any = {}) => {
      let rows = this.attempts.filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      rows = rows.slice(skip ?? 0, (skip ?? 0) + (take ?? rows.length));
      return rows.map((r) => ({ ...r, ...(include?.project ? { project: { name: `name-${r.projectId}` } } : {}) }));
    },
    count: async ({ where }: any) => this.attempts.filter((r) => matches(r, where)).length,
  };
}

/** SET NX EX / GET / SET EX / DEL on an in-memory store with a controllable clock. */
export class FakeKv {
  private store = new Map<string, { value: string; expiresAt: number }>();
  now = 0;
  down = false;

  private live(key: string) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  acquireOnce = async (key: string, ttl: number, value = '1'): Promise<boolean | null> => {
    if (this.down) return null;
    if (this.live(key)) return false;
    this.store.set(key, { value, expiresAt: this.now + ttl * 1000 });
    return true;
  };
  getCache = async (key: string): Promise<string | null> => (this.down ? null : this.live(key)?.value ?? null);
  setCache = async (key: string, value: string, ttl?: number) => {
    if (!this.down) this.store.set(key, { value, expiresAt: this.now + (ttl ?? 1e9) * 1000 });
  };
  delCache = async (key: string) => {
    this.store.delete(key);
  };
  /** Redis restart without persistence / FLUSHALL */
  flush() {
    this.store.clear();
  }
}
