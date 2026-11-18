const created: any[] = [];
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: jest.fn(async (args: any) => {
          created.push(args);
          return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
        }),
      },
    },
  })),
);

import { BillingService } from '../src/modules/billing/billing.service';

const params = {
  orgId: 'org1',
  tier: 'starter' as const,
  successUrl: 'http://localhost:3000/dashboard?checkout=success',
  cancelUrl: 'http://localhost:3000/dashboard?checkout=cancelled',
};

describe('9. Billing checkout', () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = saved;
  });

  it('with Stripe configured: success_url is well-formed (exactly one "?")', async () => {
    const svc = new BillingService({} as any, { get: (k: string) => (k === 'STRIPE_SECRET_KEY' ? 'sk_test_x' : undefined) } as any);
    const res = await svc.createCheckoutSession(params);
    expect(res.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    const successUrl: string = created[0].success_url;
    expect((successUrl.match(/\?/g) || []).length).toBe(1);
    expect(successUrl).toBe('http://localhost:3000/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  });

  it('without Stripe: 503 billing_not_configured, never a fake success redirect', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const svc = new BillingService({} as any, { get: () => undefined } as any);
    await expect(svc.createCheckoutSession(params)).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'billing_not_configured' } },
    });
  });
});
