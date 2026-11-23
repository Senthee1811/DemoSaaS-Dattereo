/**
 * 10.1: sessions, password change and security activity, against an in-memory database so the
 * real SessionsService and AuthService logic runs (revocation, ownership, scoping), not mocks.
 */
import { HttpException, UnauthorizedException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/modules/auth/auth.service';
import { SessionsService, describeDevice, expiryToSeconds } from '../src/modules/auth/sessions.service';
import { passwordPolicyProblems } from '../src/modules/auth/password-policy';

const cfg: Record<string, string> = {
  'jwt.accessSecret': 'test-access-secret-0123456789abcdef',
  'jwt.refreshSecret': 'test-refresh-secret-0123456789abcdef',
  'jwt.accessExpiration': '15m',
  'jwt.refreshExpiration': '7d',
};
const config = { get: (k: string) => cfg[k] } as any;

/** A tiny in-memory Prisma: just the calls the security code makes. */
function fakeDb() {
  const users: any[] = [];
  const sessions: any[] = [];
  const audit: any[] = [];
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;

  const matchSession = (row: any, where: any) =>
    (where.id === undefined || (typeof where.id === 'string' ? row.id === where.id : where.id.in ? where.id.in.includes(row.id) : where.id.not ? row.id !== where.id.not : true)) &&
    (where.userId === undefined || row.userId === where.userId) &&
    (where.revokedAt === undefined || (where.revokedAt === null ? row.revokedAt === null : true)) &&
    (where.expiresAt === undefined || row.expiresAt.getTime() > where.expiresAt.gt.getTime());

  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id), data),
    },
    userSession: {
      create: async ({ data }: any) => {
        const row = { id: id('sess'), createdAt: new Date(), lastUsedAt: new Date(), revokedAt: null, userAgent: null, ip: null, ...data };
        sessions.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => sessions.find((r) => matchSession(r, where)) ?? null,
      findMany: async ({ where, select }: any) => sessions.filter((r) => matchSession(r, where)).map((r) => (select ? { id: r.id } : r)),
      update: async ({ where, data }: any) => Object.assign(sessions.find((r) => r.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const rows = sessions.filter((r) => matchSession(r, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      count: async ({ where }: any) => sessions.filter((r) => matchSession(r, where)).length,
    },
    auditLog: {
      create: async ({ data }: any) => {
        const row = { id: id('audit'), createdAt: new Date(Date.now() + audit.length), ...data };
        audit.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => audit.filter((a) => a.actor === where.actor && a.action === where.action).sort((a, b) => +b.createdAt - +a.createdAt)[0] ?? null,
      findMany: async ({ where, take, skip }: any) =>
        audit
          .filter((a) => a.actor === where.actor && where.action.in.includes(a.action))
          .sort((a, b) => +b.createdAt - +a.createdAt)
          .slice(skip, skip + take),
      count: async ({ where }: any) => audit.filter((a) => a.actor === where.actor && where.action.in.includes(a.action)).length,
    },
  };
  return { prisma, users, sessions, audit };
}

function fakeRedis(up = true) {
  const store = new Map<string, string>();
  const client = {
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => (store.set(k, v), 'OK'),
    exists: async (k: string) => (store.has(k) ? 1 : 0),
    incr: async (k: string) => {
      const v = Number(store.get(k) || 0) + 1;
      store.set(k, String(v));
      return v;
    },
    expire: async () => 1,
    del: async (k: string) => (store.delete(k) ? 1 : 0),
  };
  return { store, service: { getClient: () => (up ? client : null), isConnected: up } as any };
}

async function setup() {
  const db = fakeDb();
  const redis = fakeRedis();
  const jwt = new JwtService({});
  const sessions = new SessionsService(db.prisma, redis.service, config);
  const auth = new AuthService(db.prisma, jwt, config, redis.service, {} as any, sessions);
  const passwordHash = await auth.hashPassword('CorrectHorse!42');
  const alice = { id: 'u-alice', email: 'alice@x.co', name: 'Alice', role: 'OWNER', orgId: 'o1', passwordHash, deactivatedAt: null, passwordChangedAt: null, createdAt: new Date('2026-01-01'), organization: { name: 'Acme' } };
  const bob = { ...alice, id: 'u-bob', email: 'bob@x.co', name: 'Bob', orgId: 'o2', organization: { name: 'Bobco' } };
  db.users.push(alice, bob);
  return { ...db, redis, jwt, sessions, auth, alice, bob };
}

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('device labels and expiry', () => {
  it('describes a device without keeping the raw user agent', () => {
    expect(describeDevice(CHROME_WIN)).toBe('Chrome on Windows');
    expect(describeDevice(SAFARI_IOS)).toBe('Safari on iOS');
    expect(describeDevice(undefined)).toBe('Unknown device');
  });
  it('parses token lifetimes', () => {
    expect(expiryToSeconds('7d')).toBe(604800);
    expect(expiryToSeconds('15m')).toBe(900);
    expect(expiryToSeconds('nonsense')).toBe(604800);
  });
});

describe('10.1-C sessions: revocation really stops a session', () => {
  it('login creates a session with the device; its refresh token works until the session is revoked', async () => {
    const t = await setup();
    const login: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' }, { userAgent: CHROME_WIN, ip: '203.0.113.9' });

    expect(t.sessions).toBeDefined();
    const list: any = await t.auth.listSessions({ id: t.alice.id, sessionId: undefined });
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]).toMatchObject({ device: 'Chrome on Windows', ip: '203.0.113.9', current: false });

    await expect(t.auth.refresh(login.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('a revoked session can no longer refresh, while another session of the same user still can', async () => {
    const t = await setup();
    const a: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' }, { userAgent: CHROME_WIN });
    const b: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' }, { userAgent: SAFARI_IOS });
    const sidA = (t.jwt.decode(a.refreshToken) as any).sid;
    const sidB = (t.jwt.decode(b.refreshToken) as any).sid;
    expect(sidA).not.toBe(sidB);

    await t.auth.revokeSession({ id: t.alice.id, email: t.alice.email, sessionId: sidB }, sidA, false);

    await expect(t.auth.refresh(a.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(t.auth.refresh(b.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('the revoked session\'s ACCESS token is refused immediately too (not after 15 minutes)', async () => {
    const t = await setup();
    const a: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    const sidA = (t.jwt.decode(a.accessToken) as any).sid;
    await expect(t.auth.validateUser({ sub: t.alice.id, email: t.alice.email, orgId: 'o1', role: 'OWNER', sid: sidA })).resolves.toBeTruthy();

    await t.sessions.revokeAllExcept(t.alice.id, undefined);

    await expect(t.auth.validateUser({ sub: t.alice.id, email: t.alice.email, orgId: 'o1', role: 'OWNER', sid: sidA })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a user cannot revoke or even see another user\'s session (it is "not found")', async () => {
    const t = await setup();
    await t.auth.login({ email: 'bob@x.co', password: 'CorrectHorse!42' }, { userAgent: CHROME_WIN });
    const bobSid = t.sessions && (await t.sessions.list(t.bob.id))[0].id;

    await expect(t.auth.revokeSession({ id: t.alice.id, email: t.alice.email }, bobSid, true)).rejects.toBeInstanceOf(NotFoundException);
    expect(((await t.auth.listSessions({ id: t.alice.id })) as any).sessions).toHaveLength(0);
    expect(await t.sessions.count(t.bob.id)).toBe(1); // untouched
  });

  it('revoking the CURRENT session needs explicit confirmation (409 current_session), then works', async () => {
    const t = await setup();
    const a: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    const sid = (t.jwt.decode(a.accessToken) as any).sid;
    const actor = { id: t.alice.id, email: t.alice.email, sessionId: sid };

    const err: any = await t.auth.revokeSession(actor, sid, false).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().error.code).toBe('current_session');
    expect(await t.sessions.count(t.alice.id)).toBe(1); // still there

    await expect(t.auth.revokeSession(actor, sid, true)).resolves.toMatchObject({ success: true, revokedCurrent: true });
    expect(await t.sessions.count(t.alice.id)).toBe(0);
  });

  it('"sign out others" keeps the current session and reports how many it ended', async () => {
    const t = await setup();
    const cur: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    const sid = (t.jwt.decode(cur.accessToken) as any).sid;

    const res: any = await t.auth.revokeOtherSessions({ id: t.alice.id, email: t.alice.email, sessionId: sid });

    expect(res).toEqual({ success: true, revoked: 2 });
    const left = (await t.sessions.list(t.alice.id, sid)) as any[];
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: sid, current: true });
    expect(t.audit.some((a) => a.action === 'OTHER_SESSIONS_REVOKED')).toBe(true);
  });

  it('a token from before sessions existed (no sid) is adopted into a session on its next refresh', async () => {
    const t = await setup();
    const legacy = t.jwt.sign({ sub: t.alice.id, email: t.alice.email, orgId: 'o1', role: 'OWNER' }, { secret: cfg['jwt.refreshSecret'], expiresIn: '7d' });

    const out: any = await t.auth.refresh(legacy);

    expect((t.jwt.decode(out.refreshToken) as any).sid).toBeTruthy();
    expect(await t.sessions.count(t.alice.id)).toBe(1);
  });

  it('logout ends the session as well as the token', async () => {
    const t = await setup();
    const a: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    await t.auth.logout(a.refreshToken);
    expect(await t.sessions.count(t.alice.id)).toBe(0);
    await expect(t.auth.refresh(a.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('10.1-B change password', () => {
  const run = async (t: Awaited<ReturnType<typeof setup>>, currentPassword: string, newPassword: string, sessionId?: string) =>
    t.auth.changePassword({ id: t.alice.id, sessionId }, { currentPassword, newPassword }, { userAgent: CHROME_WIN, ip: '203.0.113.9' });

  it('the policy is enforced on the server', () => {
    expect(passwordPolicyProblems('short')).toHaveLength(1);
    expect(passwordPolicyProblems('x'.repeat(200))).toHaveLength(1);
    expect(passwordPolicyProblems('samesame1', 'samesame1')).toEqual(['Choose a password different from your current one.']);
    expect(passwordPolicyProblems('long-enough-1', 'old-password')).toEqual([]);
  });

  it('a wrong current password is a 400 (never 401), and nothing changes', async () => {
    const t = await setup();
    const before = t.alice.passwordHash;
    const err: any = await run(t, 'not-my-password', 'BrandNewPass#1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().error.code).toBe('invalid_current_password');
    expect(t.alice.passwordHash).toBe(before);
    expect(t.alice.passwordChangedAt).toBeNull();
  });

  it('a weak or unchanged new password is rejected with a specific message', async () => {
    const t = await setup();
    const weak: any = await run(t, 'CorrectHorse!42', 'short').catch((e) => e);
    expect(weak.getResponse().error.code).toBe('weak_password');
    expect(weak.getResponse().error.message).toContain('at least 8');
    const same: any = await run(t, 'CorrectHorse!42', 'CorrectHorse!42').catch((e) => e);
    expect(same.getResponse().error.message).toContain('different from your current');
  });

  it('success: new password works, old one does not, change is recorded, OTHER sessions end, this one stays', async () => {
    const t = await setup();
    const cur: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' }, { userAgent: CHROME_WIN });
    const other: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' }, { userAgent: SAFARI_IOS });
    const sid = (t.jwt.decode(cur.accessToken) as any).sid;

    const res: any = await run(t, 'CorrectHorse!42', 'BrandNewPass#1', sid);

    expect(res).toMatchObject({ success: true, otherSessionsSignedOut: 1 });
    expect(t.alice.passwordChangedAt).toBeInstanceOf(Date);
    await expect(t.auth.login({ email: 'alice@x.co', password: 'BrandNewPass#1' })).resolves.toHaveProperty('accessToken');
    await expect(t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(t.auth.refresh(other.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException); // signed out
    await expect(t.auth.refresh(cur.refreshToken)).resolves.toHaveProperty('accessToken'); // still signed in
  });

  it('never stores or returns a password: not in the audit log, the response, or the stored hash', async () => {
    const t = await setup();
    const res = await run(t, 'CorrectHorse!42', 'BrandNewPass#1');
    const everything = JSON.stringify({ res, audit: t.audit });
    expect(everything).not.toContain('BrandNewPass#1');
    expect(everything).not.toContain('CorrectHorse!42');
    expect(t.alice.passwordHash).toMatch(/^\$pbkdf2\$/);
    expect(t.alice.passwordHash).not.toContain('BrandNewPass#1');
  });

  it('five wrong current passwords lock the form (429) even for the right one, until it expires', async () => {
    const t = await setup();
    for (let i = 0; i < 5; i++) await run(t, 'wrong', 'BrandNewPass#1').catch(() => undefined);
    const err: any = await run(t, 'CorrectHorse!42', 'BrandNewPass#1').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(t.alice.passwordChangedAt).toBeNull();
  });
});

describe('10.1-A/D overview and security activity are real and scoped to the user', () => {
  it('overview reports facts only: MFA is "unsupported", there is no score, last change is null until recorded', async () => {
    const t = await setup();
    const cur: any = await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    const o: any = await t.auth.securityOverview({ id: t.alice.id, sessionId: (t.jwt.decode(cur.accessToken) as any).sid });

    expect(o.mfa).toEqual({ supported: false });
    expect(o.password).toEqual({ set: true, changedAt: null });
    expect(o.sessions.active).toBe(1);
    expect(o.sessions.currentStartedAt).toBeTruthy();
    expect(JSON.stringify(o)).not.toMatch(/score|percent/i);
    expect(JSON.stringify(o)).not.toContain('passwordHash');
  });

  it('records sign-ins, failures (only for real accounts), password change and revocations; shows only the caller\'s', async () => {
    const t = await setup();
    await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' }, { userAgent: CHROME_WIN, ip: '203.0.113.9' });
    await t.auth.login({ email: 'alice@x.co', password: 'wrong' }, { userAgent: CHROME_WIN }).catch(() => undefined);
    await t.auth.login({ email: 'nobody@x.co', password: 'wrong' }).catch(() => undefined); // no such account: nothing recorded
    await t.auth.login({ email: 'bob@x.co', password: 'CorrectHorse!42' });
    await t.auth.changePassword({ id: t.alice.id }, { currentPassword: 'CorrectHorse!42', newPassword: 'BrandNewPass#1' });

    const mine: any = await t.auth.securityActivity({ id: t.alice.id, email: 'alice@x.co' });

    expect(mine.events.map((e: any) => e.type)).toEqual(['PASSWORD_CHANGED', 'LOGIN_FAILED', 'LOGIN_SUCCESS']);
    expect(mine.total).toBe(3);
    expect(t.audit.some((a) => a.actor === 'nobody@x.co')).toBe(false);
    // Bob's events never appear for Alice
    expect(mine.events.every((e: any) => e.id && !JSON.stringify(e).includes('bob'))).toBe(true);
    // Timestamps are UTC ISO strings; only a device label and IP are exposed
    expect(mine.events[2]).toMatchObject({ device: 'Chrome on Windows', ip: '203.0.113.9' });
    expect(mine.events[2].at).toMatch(/Z$/);
    expect(Object.keys(mine.events[2]).sort()).toEqual(['at', 'device', 'id', 'ip', 'type']);
  });

  it('is paginated and the page size is capped', async () => {
    const t = await setup();
    for (let i = 0; i < 7; i++) await t.auth.login({ email: 'alice@x.co', password: 'CorrectHorse!42' });
    const page1: any = await t.auth.securityActivity({ id: t.alice.id, email: 'alice@x.co' }, 3, 0);
    const page3: any = await t.auth.securityActivity({ id: t.alice.id, email: 'alice@x.co' }, 3, 6);
    expect(page1.events).toHaveLength(3);
    expect(page1.total).toBe(7);
    expect(page3.events).toHaveLength(1);
    expect(((await t.auth.securityActivity({ id: t.alice.id, email: 'alice@x.co' }, 9999, 0)) as any).limit).toBe(50);
  });
});
