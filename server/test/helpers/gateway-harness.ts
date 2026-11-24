import { GatewayService } from '../../src/modules/gateway/gateway.service';
import { PricingService } from '../../src/modules/pricing/pricing.service';

/** Shared GatewayService harness: real service + real pricing, everything else a recording double. */
export const redisStub: any = { isConnected: false, getClient: () => null };
export const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, redisStub);

export interface HarnessOptions {
  adapterResult?: any;
  adapterError?: Error;
  budgetOverride?: any;
  ledgerFails?: boolean;
  ledgerQueueFails?: boolean;
  anomalyQueue?: 'ok' | 'rejects' | 'throws';
}

export function harness(opts: HarnessOptions = {}) {
  const calls: string[] = [];
  const hold = { requestId: 'set-below', amount: 0, buckets: [] as any[] };

  const prisma: any = {
    providerApiKey: {
      findFirst: jest.fn(async () => ({ id: 'pk1', encryptedKey: 'enc' })),
      update: jest.fn(async () => ({})),
    },
    project: { findUnique: jest.fn(async () => ({ orgId: 'org-a' })) },
    requestAttempt: { create: jest.fn(async () => ({})) },
    request: {
      create: jest.fn(async () => {
        calls.push('ledger.create');
        if (opts.ledgerFails) throw Object.assign(new Error('db down'), { code: 'P1001' });
        return {};
      }),
      findMany: jest.fn(async () => {
        throw new Error('the gateway hot path must not query request history');
      }),
    },
  };

  const budget: any = {
    reserveCapacity: jest.fn(async (_p: string, requestId: string, amount: number) => {
      calls.push('reserve');
      hold.requestId = requestId;
      hold.amount = amount;
      return { canProceed: true, isHardBlocked: false, budgetMonthly: 100, currentMonthlySpend: 1, utilizationPct: 1, hold, logRequestContent: false, ...opts.budgetOverride };
    }),
    settleHold: jest.fn(async () => {
      calls.push('settle');
      return { applied: true, spend: 1 };
    }),
    releaseHold: jest.fn(async () => {
      calls.push('release');
    }),
    markPendingPersist: jest.fn(async () => {
      calls.push('markPending');
    }),
    clearPendingPersist: jest.fn(async () => {
      calls.push('clearPending');
    }),
    evaluatePostRequestThresholds: jest.fn(async () => {}),
    recordAlert: jest.fn(async () => true),
  };

  const redis: any = {
    reserveTpm: jest.fn(async () => ({ allowed: true, counterKey: 'tpm-key', count: 0 })),
    adjustTpm: jest.fn(async () => {}),
  };

  const adapter: any = {
    execute: jest.fn(async () => {
      calls.push('upstream');
      if (opts.adapterError) throw opts.adapterError;
      return opts.adapterResult ?? { responseText: 'Rome.', promptTokens: 100, completionTokens: 20, totalTokens: 120, isSimulated: false };
    }),
  };
  const ledgerQueue: any = {
    add: jest.fn(async () => {
      if (opts.ledgerQueueFails) throw new Error('queue down');
      calls.push('ledgerQueue.add');
    }),
  };
  const anomalyQueue: any = {
    add: jest.fn(() => {
      calls.push('anomalyQueue.add');
      if (opts.anomalyQueue === 'throws') throw new Error('sync boom');
      return opts.anomalyQueue === 'rejects' ? Promise.reject(new Error('redis down')) : Promise.resolve({});
    }),
  };
  const encryption: any = { decryptApiKey: jest.fn(() => 'sk-test-0123456789abcdef') };

  const service = new GatewayService(prisma, redis, budget, pricing, encryption, adapter, adapter, adapter, adapter, ledgerQueue, anomalyQueue);
  return { service, prisma, budget, redis, adapter, ledgerQueue, anomalyQueue, hold, calls };
}

export const request = (extra: any = {}) => ({
  projectId: 'proj-a',
  model: 'gpt-4o',
  messages: [{ role: 'user' as const, content: 'What is the capital of Italy? Please be brief.' }],
  maxTokens: 200,
  gatewayKey: { id: 'gk1', budgetMonthly: null, rateLimitTpm: 100000 },
  ...extra,
});
