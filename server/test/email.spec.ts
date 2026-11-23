const sent: any[] = [];
let resendResult: any = { data: { id: 'e1' }, error: null };
let resendThrows = false;
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (args: any) => {
        if (resendThrows) throw new Error('network down');
        sent.push(args);
        return resendResult;
      }),
    },
  })),
}));

import { EmailService } from '../src/modules/email/email.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { TeamService } from '../src/modules/team/team.service';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  sent.length = 0;
  resendResult = { data: { id: 'e1' }, error: null };
  resendThrows = false;
});

describe('EmailService', () => {
  it('without RESEND_API_KEY: no-op, never throws, returns false', async () => {
    delete process.env.RESEND_API_KEY;
    const svc = new EmailService();
    await expect(svc.sendPasswordReset('a@b.co', 'http://x/y?token=t')).resolves.toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('with a key: sends the reset link', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'SpendGuard <noreply@example.com>';
    await expect(new EmailService().sendPasswordReset('a@b.co', 'http://app/forgot-password?token=abc')).resolves.toBe(true);
    expect(sent[0].to).toBe('a@b.co');
    expect(sent[0].from).toBe('SpendGuard <noreply@example.com>');
    expect(sent[0].html).toContain('token=abc');
  });

  it('escapes org and inviter names in the invite HTML', async () => {
    process.env.RESEND_API_KEY = 're_test';
    await new EmailService().sendOrgInvite('a@b.co', 'http://app/x', '<img src=x>Org', '"><script>');
    expect(sent[0].html).not.toContain('<img');
    expect(sent[0].html).not.toContain('<script>');
  });

  it('a Resend error or a thrown network error is swallowed', async () => {
    process.env.RESEND_API_KEY = 're_test';
    resendResult = { data: null, error: { name: 'validation_error' } };
    await expect(new EmailService().sendPasswordReset('a@b.co', 'u')).resolves.toBe(false);
    resendThrows = true;
    await expect(new EmailService().sendPasswordReset('a@b.co', 'u')).resolves.toBe(false);
  });
});

describe('no token ever leaves the API in a response body', () => {
  it('forgotPassword: email carries the link; response has no token (non-production)', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://app.test/';
    const email = { sendPasswordReset: jest.fn(async () => true) };
    const redis = { isConnected: true, setCache: jest.fn(async () => undefined) };
    const prisma = { user: { findUnique: jest.fn(async () => ({ id: 'u1', email: 'a@b.co' })) } };
    const svc = new AuthService(prisma as any, {} as any, { get: () => undefined } as any, redis as any, email as any, {} as any);

    const res: any = await svc.forgotPassword({ email: 'A@B.co' });

    expect(JSON.stringify(res)).not.toMatch(/token/i);
    expect(res.deliveryStatus).toBeUndefined();
    const [to, url] = email.sendPasswordReset.mock.calls[0] as unknown as [string, string];
    expect(to).toBe('a@b.co');
    expect(url).toMatch(/^http:\/\/app\.test\/forgot-password\?token=[0-9a-f]{64}$/);
  });

  it('forgotPassword: unknown email → same generic response, no email', async () => {
    const email = { sendPasswordReset: jest.fn() };
    const prisma = { user: { findUnique: jest.fn(async () => null) } };
    const svc = new AuthService(prisma as any, {} as any, { get: () => undefined } as any, {} as any, email as any, {} as any);
    const res: any = await svc.forgotPassword({ email: 'nobody@b.co' });
    expect(res.success).toBe(true);
    expect(email.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('inviteMember: email carries the link; response has no token (non-production)', async () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_URL = 'http://app.test';
    const email = { sendOrgInvite: jest.fn(async () => true) };
    const redis = { isConnected: true, setCache: jest.fn(async () => undefined) };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'u2', orgId: 'o1', name: 'Carol', email: 'carol@b.co', role: 'MEMBER', createdAt: new Date() })),
      },
      organization: { findUnique: jest.fn(async () => ({ name: 'Acme' })) },
    };
    const svc = new TeamService(prisma as any, redis as any, email as any);

    const res: any = await svc.inviteMember(
      { name: 'Carol', email: 'carol@b.co', role: 'MEMBER' },
      { id: 'u1', orgId: 'o1', name: 'Alice', email: 'alice@b.co', role: 'OWNER' },
    );

    expect(JSON.stringify(res)).not.toMatch(/token/i);
    const [to, url, org, inviter] = email.sendOrgInvite.mock.calls[0] as unknown as string[];
    expect([to, org, inviter]).toEqual(['carol@b.co', 'Acme', 'Alice']);
    expect(url).toMatch(/^http:\/\/app\.test\/forgot-password\?token=[0-9a-f]{64}$/);
  });
});
