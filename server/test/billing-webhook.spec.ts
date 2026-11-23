// Uses the real `stripe` library to sign payloads, so signature verification is genuinely exercised.
import { InternalServerErrorException } from '@nestjs/common';
import { BillingService } from '../src/modules/billing/billing.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Stripe = require('stripe');

const SECRET = 'whsec_test_secret';
const KEY = 'sk_test_x';

const event = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', metadata: { orgId: 'org1', tier: 'growth' } } },
  ...over,
});

const sign = (payload: string, secret = SECRET) =>
  new Stripe(KEY).webhooks.generateTestHeaderString({ payload, secret });

/** In-memory prisma: a unique event table, an upsert spy, and real rollback on throw. */
function fakePrisma() {
  const committed = new Set<string>();
  const upserts: any[] = [];
  let failUpsert = false;

  const prisma: any = {
    $transaction: async (cb: (tx: any) => Promise<void>) => {
      const pendingEvents: string[] = [];
      const pendingUpserts: any[] = [];
      const tx = {
        processedWebhookEvent: {
          create: async ({ data }: any) => {
            if (committed.has(data.id) || pendingEvents.includes(data.id)) {
              throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
            }
            pendingEvents.push(data.id);
          },
        },
        subscription: {
          upsert: async (args: any) => {
            if (failUpsert) throw new Error('db down');
            pendingUpserts.push(args);
          },
        },
      };
      await cb(tx); // throws → nothing below runs → nothing is committed
      pendingEvents.forEach((id) => committed.add(id));
      upserts.push(...pendingUpserts);
    },
  };
  return { prisma, upserts, committed, setFail: (v: boolean) => (failUpsert = v) };
}

const service = (prisma: any) =>
  new BillingService(prisma, { get: (k: string) => ({ STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: SECRET } as any)[k] } as any);

describe('Stripe webhook', () => {
  it('verifies the signature over the raw bytes and applies the plan change', async () => {
    const { prisma, upserts } = fakePrisma();
    const raw = Buffer.from(JSON.stringify(event('evt_1')));

    const res: any = await service(prisma).handleWebhook(raw, sign(raw.toString()));

    expect(res).toMatchObject({ received: true, duplicate: false });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].where).toEqual({ orgId: 'org1' });
    expect(upserts[0].create).toMatchObject({ orgId: 'org1', tier: 'growth', status: 'active', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
  });

  it('two identical event payloads: applied once, second acknowledged as a duplicate', async () => {
    const { prisma, upserts } = fakePrisma();
    const svc = service(prisma);
    const raw = JSON.stringify(event('evt_dup'));
    const header = sign(raw);

    const first: any = await svc.handleWebhook(raw, header);
    const second: any = await svc.handleWebhook(raw, header);

    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ received: true, duplicate: true });
    expect(upserts).toHaveLength(1);
  });

  it('different event IDs are each applied', async () => {
    const { prisma, upserts } = fakePrisma();
    const svc = service(prisma);
    for (const id of ['evt_a', 'evt_b']) {
      const raw = JSON.stringify(event(id));
      await svc.handleWebhook(raw, sign(raw));
    }
    expect(upserts).toHaveLength(2);
  });

  it('a bad signature is rejected and nothing is applied or recorded', async () => {
    const { prisma, upserts, committed } = fakePrisma();
    const raw = JSON.stringify(event('evt_bad'));

    const res: any = await service(prisma).handleWebhook(raw, sign(raw, 'whsec_someone_else'));

    expect(res.received).toBe(false);
    expect(upserts).toHaveLength(0);
    expect(committed.size).toBe(0);
  });

  it('a payload altered after signing is rejected', async () => {
    const { prisma, upserts } = fakePrisma();
    const raw = JSON.stringify(event('evt_tamper'));
    const header = sign(raw);
    const tampered = raw.replace('"growth"', '"enterprise"');

    const res: any = await service(prisma).handleWebhook(tampered, header);

    expect(res.received).toBe(false);
    expect(upserts).toHaveLength(0);
  });

  it('a processing failure throws (5xx so Stripe retries) and is NOT recorded, so the retry applies it', async () => {
    const { prisma, upserts, committed, setFail } = fakePrisma();
    const svc = service(prisma);
    const raw = JSON.stringify(event('evt_retry'));
    const header = sign(raw);

    setFail(true);
    await expect(svc.handleWebhook(raw, header)).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(committed.has('evt_retry')).toBe(false);
    expect(upserts).toHaveLength(0);

    setFail(false);
    const retry: any = await svc.handleWebhook(raw, header);
    expect(retry).toMatchObject({ received: true, duplicate: false });
    expect(upserts).toHaveLength(1);
  });

  it('a checkout without orgId metadata is recorded but changes nothing', async () => {
    const { prisma, upserts, committed } = fakePrisma();
    const raw = JSON.stringify(event('evt_nometa', { data: { object: { id: 'cs_2', metadata: {} } } }));

    const res: any = await service(prisma).handleWebhook(raw, sign(raw));

    expect(res.received).toBe(true);
    expect(upserts).toHaveLength(0);
    expect(committed.has('evt_nometa')).toBe(true);
  });

  it('unrelated event types are recorded and acknowledged without effects', async () => {
    const { prisma, upserts } = fakePrisma();
    const raw = JSON.stringify(event('evt_other', { type: 'invoice.created' }));
    const res: any = await service(prisma).handleWebhook(raw, sign(raw));
    expect(res.received).toBe(true);
    expect(upserts).toHaveLength(0);
  });

  it('a missing signature is rejected when Stripe is live', async () => {
    const { prisma } = fakePrisma();
    const res: any = await service(prisma).handleWebhook(JSON.stringify(event('evt_nosig')), undefined as any);
    expect(res.received).toBe(false);
  });
});
