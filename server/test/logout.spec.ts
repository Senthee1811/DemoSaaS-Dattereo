import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/modules/auth/auth.service';

const cfg: Record<string, string> = {
  'jwt.accessSecret': 'test-access-secret-0123456789abcdef',
  'jwt.refreshSecret': 'test-refresh-secret-0123456789abcdef',
  'jwt.accessExpiration': '15m',
  'jwt.refreshExpiration': '7d',
};
const config = { get: (k: string) => cfg[k] };
const user = { id: 'u1', email: 'a@b.co', orgId: 'o1', role: 'OWNER', name: 'A', deactivatedAt: null };

function fakeRedis() {
  const store = new Map<string, { value: string; ttl: number }>();
  const client = {
    set: jest.fn(async (k: string, v: string, _ex: string, ttl: number) => {
      store.set(k, { value: v, ttl });
      return 'OK';
    }),
    exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
  };
  let up = true;
  return {
    store,
    client,
    setUp: (v: boolean) => (up = v),
    service: { getClient: () => (up ? client : null), isConnected: true } as any,
  };
}

function setup() {
  const jwt = new JwtService({});
  const redis = fakeRedis();
  const prisma = { user: { findUnique: jest.fn(async () => user) } };
  // Sessions are covered in security.spec.ts; here they are a no-op so logout/refresh logic is isolated
  const sessions = { create: async () => 'sid-1', checkForRefresh: async () => 'ok', revokeIfExists: async () => {}, isRevoked: async () => false };
  const svc = new AuthService(prisma as any, jwt, config as any, redis.service, {} as any, sessions as any);
  const issue = () => (svc as any).generateTokens({ sub: 'u1', email: 'a@b.co', orgId: 'o1', role: 'OWNER' });
  return { svc, jwt, redis, issue };
}

describe('Sign-out revokes the refresh token server-side', () => {
  it('a refresh token works before logout and is rejected after it', async () => {
    const { svc, redis, issue } = setup();
    const { refreshToken } = issue();

    await expect(svc.refresh(refreshToken)).resolves.toHaveProperty('accessToken');

    const res = await svc.logout(refreshToken);
    expect(res).toEqual({ success: true, revoked: true });
    // Stored by hash, never the raw token, and only until the token would have expired anyway
    const [key] = [...redis.store.keys()];
    expect(key).not.toContain(refreshToken);
    const { ttl } = redis.store.get(key)!;
    expect(ttl).toBeGreaterThan(6 * 24 * 3600);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600);

    await expect(svc.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signing out one session does not sign out another session of the same user', async () => {
    const { svc, issue } = setup();
    const a = issue().refreshToken;
    const b = issue().refreshToken; // same user, same second
    expect(a).not.toBe(b);

    await svc.logout(a);

    await expect(svc.refresh(a)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.refresh(b)).resolves.toHaveProperty('accessToken');
  });

  it('revocation store down: logout fails with 503 instead of claiming success', async () => {
    const { svc, redis, issue } = setup();
    const { refreshToken } = issue();
    redis.setUp(false);
    await expect(svc.logout(refreshToken)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.store.size).toBe(0);
  });

  it('revocation store down: refresh fails closed', async () => {
    const { svc, redis, issue } = setup();
    const { refreshToken } = issue();
    redis.setUp(false);
    await expect(svc.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a forged token is rejected by logout', async () => {
    const { svc, jwt } = setup();
    const forged = jwt.sign({ sub: 'u1' }, { secret: 'someone-else', expiresIn: '7d' });
    await expect(svc.logout(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('an already-expired token: logout succeeds without storing anything', async () => {
    const { svc, jwt, redis } = setup();
    const expired = jwt.sign({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 60 }, { secret: cfg['jwt.refreshSecret'] });
    await expect(svc.logout(expired)).resolves.toEqual({ success: true, revoked: false });
    expect(redis.store.size).toBe(0);
  });
});
