import 'reflect-metadata';
import { getEncoding } from 'js-tiktoken';
import { harness, request, pricing } from './helpers/gateway-harness';

const overshoot = { responseText: 'x', promptTokens: 12, completionTokens: 5000, totalTokens: 5012, isSimulated: false };

afterEach(() => {
  delete process.env.GATEWAY_GEMINI_THINKING_RESERVE_TOKENS;
});

describe('reservation overruns are recorded and exposed', () => {
  it('the response says what was reserved, what was charged and the overrun; the header carries the same', async () => {
    const h = harness({ adapterResult: overshoot });
    const out = await h.service.processChatCompletion(request({ maxTokens: 200 }));
    const reserved = h.hold.amount;
    const actual = pricing.calculateCost('gpt-4o', 12, 5000);
    expect(out.governance.reservation).toEqual({ reserved_usd: reserved, actual_usd: actual, overrun_usd: Number((actual - reserved).toFixed(6)), held: true });
    expect(out.headers['X-SpendGuard-Reservation-Overrun']).toBe((actual - reserved).toFixed(6));
  });

  it('a request inside its reservation reports overrun 0', async () => {
    const h = harness();
    const out = await h.service.processChatCompletion(request());
    expect(out.governance.reservation.overrun_usd).toBe(0);
    expect(out.headers['X-SpendGuard-Reservation-Overrun']).toBe('0.000000');
  });

  it('the ledger row stores reserved cost and overrun as real columns, consistent with the metadata', async () => {
    const h = harness({ adapterResult: overshoot });
    await h.service.processChatCompletion(request({ maxTokens: 200 }));
    const data = h.prisma.request.create.mock.calls[0][0].data;
    const actual = pricing.calculateCost('gpt-4o', 12, 5000);
    expect(data.reservedCostUsd).toBe(h.hold.amount);
    expect(data.reservationOverrunUsd).toBe(Number((actual - h.hold.amount).toFixed(6)));
    expect(data.costEstimate).toBe(actual); // the ledger always holds the ACTUAL cost
    expect(JSON.parse(data.metadataJson)).toMatchObject({ holdExceeded: true, reservationHeld: true, reservedUsd: data.reservedCostUsd });
    expect(data.anomalyStatus).toBe('PENDING');
  });

  it('soft-overage mode (hard block off, nothing held) still measures against the reservation that was asked for', async () => {
    const h = harness({ adapterResult: overshoot, budgetOverride: { hold: { requestId: 'x', amount: 0, buckets: [] } } });
    const out = await h.service.processChatCompletion(request({ maxTokens: 200 }));
    expect(out.governance.reservation.held).toBe(false);
    expect(out.governance.reservation.reserved_usd).toBeGreaterThan(0);
    expect(out.governance.reservation.overrun_usd).toBeGreaterThan(0); // this used to read 0 here
  });

  it('what is charged is the actual cost, never capped at the reservation', async () => {
    const h = harness({ adapterResult: overshoot });
    const out = await h.service.processChatCompletion(request({ maxTokens: 200 }));
    expect(h.budget.settleHold.mock.calls[0][1]).toBe(out.governance.cost_estimate_usd);
    expect(out.governance.cost_estimate_usd).toBeGreaterThan(out.governance.reservation.reserved_usd);
  });
});

describe('reservation under inaccurate token estimates', () => {
  const cjk = '这是一个关于人工智能支出治理的测试句子，用来衡量令牌估算的准确性。'.repeat(200);

  it('CJK prompt: the reservation covers the real cost, so no overrun (the old chars/4 hold was ~3x short)', async () => {
    const realPrompt = getEncoding('cl100k_base').encode(cjk).length; // what the provider will actually bill as input
    const h = harness({ adapterResult: { responseText: 'ok', promptTokens: realPrompt, completionTokens: 50, totalTokens: realPrompt + 50, isSimulated: false } });
    const out = await h.service.processChatCompletion(request({ messages: [{ role: 'user', content: cjk }], maxTokens: 100 }));
    expect(out.governance.reservation.overrun_usd).toBe(0);

    const oldHold = pricing.estimateMaxCost('gpt-4o', Math.ceil(cjk.length / 4), 100);
    const trueCost = pricing.calculateCost('gpt-4o', realPrompt, 50);
    expect(oldHold).toBeLessThan(trueCost); // previous behaviour under-reserved this request
    expect(h.hold.amount).toBeGreaterThanOrEqual(trueCost);
  });

  it('when a provider tokenizer still counts MORE than the estimate, the overrun is charged and reported (no silent cap)', async () => {
    const h = harness({ adapterResult: { responseText: 'ok', promptTokens: 4000, completionTokens: 10, totalTokens: 4010, isSimulated: false } });
    const out = await h.service.processChatCompletion(request({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }));
    expect(out.governance.reservation.overrun_usd).toBeGreaterThan(0);
    expect(h.budget.settleHold.mock.calls[0][1]).toBe(pricing.calculateCost('gpt-4o', 4000, 10));
  });

  it('the Gemini thinking reserve (opt-in) raises the hold and the TPM admission by exactly that many output tokens', async () => {
    const base = harness();
    await base.service.processChatCompletion(request({ model: 'gemini-3.8-flash' }));
    const without = base.hold.amount;
    process.env.GATEWAY_GEMINI_THINKING_RESERVE_TOKENS = '2000';
    const h = harness();
    await h.service.processChatCompletion(request({ model: 'gemini-3.8-flash' }));
    expect(h.hold.amount).toBeCloseTo(without + (2000 / 1_000_000) * 3.75, 6);
    expect(h.redis.reserveTpm.mock.calls[0][1]).toBe(base.redis.reserveTpm.mock.calls[0][1] + 2000);
  });
});

describe('price snapshot consistency inside one request', () => {
  it('an admin price edit WHILE the provider call is in flight changes neither the reservation nor the charge of that request', async () => {
    const h = harness();
    const original = pricing.getModelPrice('gpt-4o')!;
    h.adapter.execute.mockImplementationOnce(async () => {
      (pricing as any).memoryCache.set('gpt-4o', { ...original, inputPricePerMillion: 250, outputPricePerMillion: 1000 }); // 100x mid-flight
      return { responseText: 'x', promptTokens: 100, completionTokens: 20, totalTokens: 120, isSimulated: false };
    });
    try {
      const out = await h.service.processChatCompletion(request());
      const expected = Number(((100 * original.inputPricePerMillion + 20 * original.outputPricePerMillion) / 1_000_000).toFixed(6));
      expect(out.governance.cost_estimate_usd).toBe(expected);
      expect(out.governance.reservation.overrun_usd).toBe(0);
    } finally {
      (pricing as any).memoryCache.set('gpt-4o', original);
    }
  });

  it('a model deactivated mid-flight does not break settlement (the snapshot still prices it)', async () => {
    const h = harness();
    const original = pricing.getModelPrice('gpt-4o')!;
    h.adapter.execute.mockImplementationOnce(async () => {
      (pricing as any).memoryCache.delete('gpt-4o');
      return { responseText: 'x', promptTokens: 100, completionTokens: 20, totalTokens: 120, isSimulated: false };
    });
    try {
      await expect(h.service.processChatCompletion(request())).resolves.toBeDefined();
      expect(h.budget.settleHold).toHaveBeenCalledTimes(1);
      expect(h.prisma.request.create).toHaveBeenCalledTimes(1);
    } finally {
      (pricing as any).memoryCache.set('gpt-4o', original);
    }
  });
});

describe('finish reason and anomaly status in the response', () => {
  it("returns the provider's real finish reason and keeps the raw value", async () => {
    const h = harness({ adapterResult: { responseText: 'cut off', promptTokens: 10, completionTokens: 100, totalTokens: 110, isSimulated: false, finishReason: 'length', providerFinishReason: 'MAX_TOKENS' } });
    const out = await h.service.processChatCompletion(request());
    expect(out.choices[0].finish_reason).toBe('length');
    expect(out.governance.provider_finish_reason).toBe('MAX_TOKENS');
  });

  it('is_anomaly is null and anomaly.status is "pending": an unevaluated request is never reported as clean', async () => {
    const h = harness();
    const out = await h.service.processChatCompletion(request());
    expect(out.governance.is_anomaly).toBeNull();
    expect(out.governance.is_anomaly).not.toBe(false);
    expect(out.governance.anomaly).toEqual({ status: 'pending', evaluated_at: null, reason: null });
    expect(out.headers['X-SpendGuard-Anomaly-Status']).toBe('pending');
  });

  it('a blocked request is stored SKIPPED (it is never scored), not PENDING', async () => {
    const h = harness({ budgetOverride: { canProceed: false, isHardBlocked: true, blockReason: 'Budget Cap Exceeded: x', hold: undefined } });
    await h.service.processChatCompletion(request()).catch(() => undefined);
    await new Promise((r) => setImmediate(r));
    expect(h.prisma.request.create.mock.calls[0][0].data).toMatchObject({ isBlocked: true, anomalyStatus: 'SKIPPED' });
  });
});
