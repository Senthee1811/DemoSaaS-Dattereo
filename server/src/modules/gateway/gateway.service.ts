import { Injectable, Logger, HttpException, HttpStatus, Optional } from '@nestjs/common';
import { MetricsService } from '@/modules/metrics/metrics.service';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  REQUEST_LEDGER_QUEUE,
  PERSIST_REQUEST_JOB,
  PERSIST_REQUEST_JOB_OPTS,
  PERSIST_ATTEMPT_JOB,
  AttemptRowJob,
  LedgerRowJob,
} from './request-ledger.queue';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { PricingService, computeCost, computeMaxCost } from '@/modules/pricing/pricing.service';
import { scrubSecrets } from '@/common/scrub-secrets';
import { classifyAttempt } from './attempt-classification';
import { ESTIMATOR_VERSION, estimateChatTokens } from '@/modules/pricing/token-estimator';
import { ANOMALY_QUEUE, DETECT_ANOMALY_JOB, DETECT_ANOMALY_JOB_OPTS, AnomalyJob } from '@/modules/anomaly/anomaly.queue';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { GroqAdapter } from './adapters/groq.adapter';
import { GatewayChatRequest } from './adapters/provider.adapter.interface';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly budgetService: BudgetService,
    private readonly pricingService: PricingService,
    private readonly encryptionService: EncryptionService,
    private readonly openAIAdapter: OpenAIAdapter,
    private readonly anthropicAdapter: AnthropicAdapter,
    private readonly geminiAdapter: GeminiAdapter,
    private readonly groqAdapter: GroqAdapter,
    @InjectQueue(REQUEST_LEDGER_QUEUE) private readonly ledgerQueue: Queue,
    @InjectQueue(ANOMALY_QUEUE) private readonly anomalyQueue: Queue,
    // Optional so the service stays constructible without the metrics module (tests, scripts)
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private count(name: string, labels: Record<string, string | number> = {}, by = 1) {
    this.metrics?.inc(name, labels, by);
  }

  async processChatCompletion(req: GatewayChatRequest) {
    const startTime = Date.now();
    const startedAt = new Date(startTime);
    // One ID for the whole request: budget hold, ledger row and response id.
    const reqId = `req_${randomUUID()}`;
    const provider = this.pricingService.resolveProvider(req.model);
    const promptText = req.messages.map(m => m.content).join(' ');
    const maxTokens = req.maxTokens ?? 1000;
    // Snapshot the price row once (throws 400 model_not_priced for an unknown model, before any
    // hold). The reservation and the settlement below use this same row, so an admin editing or
    // deactivating the model mid-request cannot make settlement fail or use a different rate.
    const priceRow = this.pricingService.requireModelPrice(req.model);
    // Hold sizing: a class-aware, provider-scaled prompt estimate (chars/4 under-counted JSON, CJK,
    // emoji and base64 by 2-3x) plus every output token the request may produce. This is a
    // reservation, not billing: settlement below uses the provider-reported usage.
    const promptTokens = this.pricingService.estimateReservationTokens(provider, req.messages);
    const reservedOutputTokens = this.pricingService.reservedOutputTokens(provider, maxTokens);
    const maxEstimatedCost = computeMaxCost(priceRow, promptTokens, reservedOutputTokens);
    // Non-sensitive estimator telemetry (numbers only) for accuracy reports; stored on the ledger row if the call succeeds
    const estimatorSnapshot = { estimatedInputTokens: estimateChatTokens(req.messages), reservedInputTokens: promptTokens, reservedOutputTokens, estimatorVersion: ESTIMATOR_VERSION };

    // 1a. Per-key tokens-per-minute: admit (prompt estimate + max output) before the call
    const estimatedTokens = promptTokens + reservedOutputTokens;
    let tpm: { counterKey: string } | null = null;
    if (req.gatewayKey?.rateLimitTpm) {
      const admitted = await this.redisService.reserveTpm(req.gatewayKey.id, estimatedTokens, req.gatewayKey.rateLimitTpm);
      if (admitted && !admitted.allowed) {
        throw new HttpException(
          {
            error: {
              message: `SpendGuard key token rate limit exceeded: ${req.gatewayKey.rateLimitTpm} tokens per minute (this request may use up to ${estimatedTokens}).`,
              type: 'rate_limit_exceeded',
              code: 'tpm_exceeded',
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // admitted === null: Redis is down; the budget hold below fails closed.
      tpm = admitted;
    }
    const releaseTpm = () => (tpm ? this.redisService.adjustTpm(tpm.counterKey, -estimatedTokens) : Promise.resolve());

    // 1b. Pre-Flight Concurrency-Safe Atomic Budget Capacity Reservation
    //     (project monthly cap and, for key traffic, the key's monthly cap)
    const reserveT0 = process.hrtime.bigint();
    const budgetGuard = await this.budgetService.reserveCapacity(
      req.projectId,
      reqId,
      maxEstimatedCost,
      req.gatewayKey ? { id: req.gatewayKey.id, budgetMonthly: req.gatewayKey.budgetMonthly } : undefined,
    );
    this.metrics?.observe('spendguard_reservation_duration_ms', Number(process.hrtime.bigint() - reserveT0) / 1e6);

    if (!budgetGuard.canProceed) {
      await releaseTpm();
      // Log blocked attempt into audit ledger (async)
      this.logBlockedRequest(reqId, req, provider, budgetGuard).catch(err =>
        this.logger.warn(`Could not log blocked request: ${err.message}`),
      );

      const isGovernanceUnavailable = budgetGuard.blockReason?.includes('Governance engine unavailable');
      const errorCode = isGovernanceUnavailable ? 'governance_unavailable' : (budgetGuard.blockCode ?? 'budget_exceeded');
      this.count('spendguard_gateway_requests_total', { outcome: isGovernanceUnavailable ? 'blocked_governance_unavailable' : 'blocked_budget' });
      if (isGovernanceUnavailable) this.count('spendguard_redis_failures_total', { op: 'reserve' });
      const httpStatus = isGovernanceUnavailable
        ? HttpStatus.SERVICE_UNAVAILABLE   // 503 for infra failure
        : HttpStatus.TOO_MANY_REQUESTS;    // 429 for budget exceeded

      throw new HttpException(
        {
          error: {
            message: `SpendGuard AI Guardrail: Request blocked. ${budgetGuard.blockReason}`,
            type: errorCode,
            code: errorCode,
            project_id: req.projectId,
            budget_monthly: budgetGuard.budgetMonthly,
            current_spend: budgetGuard.currentMonthlySpend,
          },
        },
        httpStatus,
      );
    }

    const hold = budgetGuard.hold!;

    // 2. Fetch scoped provider API key from encrypted vault
    let decryptedKey: string | undefined;
    try {
      const providerKeyRow = await this.prisma.providerApiKey.findFirst({
        where: {
          projectId: req.projectId,
          provider,
          isActive: true,
        },
      });

      if (providerKeyRow) {
        decryptedKey = this.encryptionService.decryptApiKey(providerKeyRow.encryptedKey);
        
        // Update last used timestamp (async)
        this.prisma.providerApiKey.update({
          where: { id: providerKeyRow.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});
      }
    } catch (err: any) {
      this.logger.warn(`Key lookup warning: ${err.message}`);
    }

    // 3. Dispatch to Provider Adapter (Safe execution with reservation rollback on failure)
    let adapterResult;
    const providerT0 = process.hrtime.bigint();
    try {
      if (provider === 'ANTHROPIC') {
        adapterResult = await this.anthropicAdapter.execute(req, decryptedKey);
      } else if (provider === 'GEMINI') {
        adapterResult = await this.geminiAdapter.execute(req, decryptedKey);
      } else if (provider === 'GROQ') {
        adapterResult = await this.groqAdapter.execute(req, decryptedKey);
      } else {
        adapterResult = await this.openAIAdapter.execute(req, decryptedKey);
      }
    } catch (upstreamErr) {
      this.metrics?.observe('spendguard_provider_duration_ms', Number(process.hrtime.bigint() - providerT0) / 1e6, { provider, outcome: 'error' });
      this.count('spendguard_gateway_requests_total', { outcome: 'upstream_error' });
      // Release this request's hold so failures do not drain the project cap
      await this.budgetService.releaseHold(hold);
      await releaseTpm();
      // Audit the failed call in its own table: no spend, no prompt, no credentials (see recordFailedAttempt)
      await this.recordFailedAttempt({ reqId, startedAt, req, provider, estimatedCostUsd: maxEstimatedCost, err: upstreamErr });
      throw upstreamErr;
    }

    this.metrics?.observe('spendguard_provider_duration_ms', Number(process.hrtime.bigint() - providerT0) / 1e6, { provider, outcome: 'ok' });
    const latencyMs = Date.now() - startTime;
    // Actual cost from provider-reported usage: cached input at the cached rate, reasoning tokens
    // already inside completionTokens (adapters normalise this).
    const costEstimate = computeCost(priceRow, adapterResult.promptTokens, adapterResult.completionTokens, {
      cachedTokens: adapterResult.cachedPromptTokens,
      cacheWriteTokens: adapterResult.cacheWriteTokens,
    });
    // Reservation vs reality. Output is bounded by max_tokens (OpenAI/Groq: max_completion_tokens,
    // which includes reasoning; Anthropic: max_tokens includes thinking), so actual cost should fit
    // the reservation. If it does not (input under-estimated, or a provider exceeded its limit),
    // settlement still charges the ACTUAL cost, never the hold, and the overrun is stored on the
    // ledger row and returned to the caller. So the cap is enforced against RESERVATIONS: spend can
    // exceed it by the overruns of requests that were in flight (docs/BUDGET_ENFORCEMENT_AND_PROVIDER_CONTRACTS.md).
    // Measured against what was ASKED to be reserved, so soft-overage mode (nothing held) still counts.
    const reservedUsd = maxEstimatedCost;
    const reservationHeld = hold.amount > 0;
    const overrunUsd = Math.max(0, Number((costEstimate - reservedUsd).toFixed(6)));
    const holdExceeded = overrunUsd > 0;
    this.count('spendguard_usage_total', { status: adapterResult.usageEstimated === true ? 'estimated' : 'confirmed' });
    if (holdExceeded) {
      this.count('spendguard_reservation_overruns_total');
      this.logger.warn(
        `RESERVATION OVERRUN request=${reqId} project=${req.projectId} model=${req.model} cost=$${costEstimate.toFixed(6)} reserved=$${reservedUsd.toFixed(6)} overrun=$${overrunUsd.toFixed(6)}; actual cost charged.`,
      );
    }

    // 4. Reconcile atomic reservation with verified actual usage
    // Marked pending BEFORE settling, so reconciliation can never lower spend
    // below this charge while its ledger row is still being written.
    await this.budgetService.markPendingPersist(req.projectId, reqId, startedAt);
    const settleT0 = process.hrtime.bigint();
    const settled = await this.budgetService.settleHold(hold, costEstimate);
    this.metrics?.observe('spendguard_settlement_duration_ms', Number(process.hrtime.bigint() - settleT0) / 1e6);
    if (settled && !settled.applied) this.count('spendguard_duplicate_settlement_attempts_total');
    // TPM counts what was actually used, not the pre-call estimate
    if (tpm) await this.redisService.adjustTpm(tpm.counterKey, adapterResult.totalTokens - estimatedTokens);
    if (!settled) {
      this.count('spendguard_redis_failures_total', { op: 'settle' });
      // Redis lost mid-request: the hold expires on its own and the scheduled
      // DB reconciliation restores the true spend counter from the ledger.
      this.logger.error(`Spend settlement failed for request ${reqId} (project ${req.projectId}); reconciliation job will correct it.`);
    }

    this.count('spendguard_gateway_requests_total', { outcome: 'success' });
    // 5. Append-only ledger row — written BEFORE the response is returned
    await this.logSuccessfulRequest(reqId, startedAt, req, provider, adapterResult, costEstimate, latencyMs, promptText, budgetGuard.logRequestContent === true, { reservedUsd, holdExceeded, overrunUsd, reservationHeld, estimator: estimatorSnapshot, price: priceRow });

    // 6. Anomaly scoring runs off the request path as a durable BullMQ job. Fire-and-forget: a
    //    queue problem is logged and can never delay, fail or alter this response or the budget.
    this.enqueueAnomalyCheck({
      requestId: reqId,
      projectId: req.projectId,
      model: req.model,
      costEstimate,
      totalTokens: adapterResult.totalTokens,
      createdAt: startedAt.toISOString(),
    });

    // 7. Post-Request Threshold Check (80% soft warning)
    const updatedSpend = budgetGuard.currentMonthlySpend + costEstimate;
    this.budgetService.evaluatePostRequestThresholds(req.projectId, updatedSpend)
      .catch(err => this.logger.warn(`Post-request threshold check error: ${err.message}`));

    const budgetRemaining = Math.max(0, budgetGuard.budgetMonthly - updatedSpend);

    // 8. OpenAI-Compatible Response Structure
    return {
      id: `chatcmpl-${reqId}`,
      object: 'chat.completion',
      created: Math.floor(startTime / 1000),
      model: req.model,
      provider,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: adapterResult.responseText,
          },
          // The provider's real stop reason in the OpenAI vocabulary ('length' = cut off by max_tokens,
          // tokens still billed). Raw value in governance.provider_finish_reason.
          finish_reason: adapterResult.finishReason ?? 'stop',
        },
      ],
      usage: {
        prompt_tokens: adapterResult.promptTokens,
        completion_tokens: adapterResult.completionTokens,
        total_tokens: adapterResult.totalTokens,
      },
      governance: {
        cost_estimate_usd: costEstimate,
        latency_ms: latencyMs,
        // Spike scoring is asynchronous, so at response time the answer is UNKNOWN, not "no".
        // `is_anomaly` therefore stays in the payload (clients that read it keep working) but is
        // null = not evaluated yet; `false` would claim a clean result that does not exist yet.
        // The outcome (clear | anomaly | failed) is on the ledger row / audit log as `anomaly_status`.
        is_anomaly: null,
        anomaly_reason: null,
        anomaly: { status: 'pending' as const, evaluated_at: null, reason: null },
        project_id: req.projectId,
        budget_remaining_usd: Number(budgetRemaining.toFixed(2)),
        fail_closed_active: true,
        provider_finish_reason: adapterResult.providerFinishReason ?? null,
        usage_estimated: adapterResult.usageEstimated === true,
        // confirmed = provider-reported usage; estimated = SpendGuard's own estimate was used for at least one count
        usage_status: adapterResult.usageEstimated === true ? 'estimated' : 'confirmed',
        // What was reserved vs what was charged. The cap is enforced on reservations, so an overrun
        // (cost > reserved) is possible and is reported here instead of being hidden.
        reservation: {
          reserved_usd: reservedUsd,
          actual_usd: costEstimate,
          overrun_usd: overrunUsd,
          held: reservationHeld,
        },
      },
      headers: {
        'X-SpendGuard-Cost': costEstimate.toFixed(6),
        'X-SpendGuard-Latency': String(latencyMs),
        'X-SpendGuard-Blocked': 'false',
        'X-SpendGuard-Anomaly-Status': 'pending',
        'X-SpendGuard-Reservation-Overrun': overrunUsd.toFixed(6),
        'X-SpendGuard-Usage': adapterResult.usageEstimated === true ? 'estimated' : 'confirmed',
      },
    };
  }

  /** Maps a thrown error to the fields stored on a request attempt. Only short, whitelisted values. */
  private classifyFailure(err: unknown): { errorClass: string; httpStatus: number; upstreamStatus?: number; upstreamCode?: string } {
    const safeToken = (v: unknown, max: number) => (typeof v === 'string' && /^[A-Za-z0-9_.:-]+$/.test(v) ? v.slice(0, max) : undefined);
    if (err instanceof HttpException) {
      const e: any = (err.getResponse() as any)?.error ?? {};
      return {
        errorClass: safeToken(e.code, 64) ?? safeToken(e.type, 64) ?? `http_${err.getStatus()}`,
        httpStatus: err.getStatus(),
        upstreamStatus: Number.isInteger(e.upstream_status) ? e.upstream_status : undefined,
        upstreamCode: typeof e.upstream_code === 'string' ? scrubSecrets(e.upstream_code).slice(0, 80) : undefined,
      };
    }
    return { errorClass: 'internal_error', httpStatus: 500 };
  }

  /**
   * Writes one `request_attempts` row for a call that failed before producing a billable result.
   *
   *  - It is NOT the spend ledger: `estimatedCostUsd` is the worst-case reservation that was just
   *    released. No spend is recorded for a failure (provider errors carry no confirmed usage).
   *  - Stored: ids, provider/model, error class and status, durations. Never stored: prompts or
   *    responses, provider or SpendGuard credentials, request headers, raw provider bodies.
   *  - Durable like the ledger: if the insert fails it is queued for retry on the same BullMQ queue.
   *  - Never throws: auditing must not change the error the caller receives.
   */
  private async recordFailedAttempt(p: {
    reqId: string;
    startedAt: Date;
    req: GatewayChatRequest;
    provider: string;
    estimatedCostUsd: number;
    err: unknown;
  }): Promise<void> {
    try {
      const cls = this.classifyFailure(p.err);
      let orgId = p.req.orgId;
      if (!orgId) {
        const proj = await this.prisma.project.findUnique({ where: { id: p.req.projectId }, select: { orgId: true } });
        orgId = proj?.orgId;
      }
      if (!orgId) {
        this.logger.error(`Failed attempt ${p.reqId} not recorded: project ${p.req.projectId} has no organization`);
        return;
      }
      const row: AttemptRowJob = {
        id: p.reqId,
        orgId,
        projectId: p.req.projectId,
        gatewayKeyId: p.req.gatewayKey?.id ?? null,
        userId: p.req.userId ?? null,
        provider: p.provider,
        model: p.req.model,
        errorClass: cls.errorClass,
        httpStatus: cls.httpStatus,
        upstreamStatus: cls.upstreamStatus ?? null,
        upstreamCode: cls.upstreamCode ?? null,
        estimatedCostUsd: p.estimatedCostUsd,
        durationMs: Math.max(0, Date.now() - p.startedAt.getTime()),
        ...classifyAttempt({ errorClass: cls.errorClass, upstreamStatus: cls.upstreamStatus ?? null }),
        createdAt: p.startedAt.toISOString(),
      };
      try {
        await this.prisma.requestAttempt.create({ data: { ...(row as any), createdAt: p.startedAt } });
      } catch (dbErr: any) {
        if (dbErr?.code === 'P2002') return; // already recorded (a retry)
        this.logger.error(`Attempt write failed for ${p.reqId} (${dbErr?.code ?? dbErr?.name}); queued for retry`);
        try {
          await this.ledgerQueue.add(PERSIST_ATTEMPT_JOB, row, { ...PERSIST_REQUEST_JOB_OPTS, jobId: `attempt-${p.reqId}` });
        } catch (queueErr: any) {
          // Last resort: one structured, secret-free line so the event is still recoverable from logs
          this.logger.error(`CRITICAL: could not queue attempt retry: ${JSON.stringify({ ...row })}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Could not record failed attempt ${p.reqId}: ${err?.message}`);
    }
  }

  private enqueueAnomalyCheck(job: AnomalyJob): void {
    try {
      // jobId = request id: one request can never be queued (or alerted on) twice
      this.anomalyQueue
        .add(DETECT_ANOMALY_JOB, job, { ...DETECT_ANOMALY_JOB_OPTS, jobId: job.requestId })
        .catch((err: any) => this.logger.warn(`Could not queue anomaly check for ${job.requestId}: ${err?.message}`));
    } catch (err: any) {
      this.logger.warn(`Could not queue anomaly check for ${job.requestId}: ${err?.message}`);
    }
  }

  private async logBlockedRequest(reqId: string, req: GatewayChatRequest, provider: string, budgetGuard: any) {
    await this.prisma.request.create({
      data: {
        id: reqId,
        projectId: req.projectId,
        userId: req.userId || null,
        gatewayKeyId: req.gatewayKey?.id ?? null,
        provider: provider as any,
        model: req.model,
        tokensIn: this.pricingService.estimateTokens(req.messages.map(m => m.content).join(' ')),
        tokensOut: 0,
        totalTokens: this.pricingService.estimateTokens(req.messages.map(m => m.content).join(' ')),
        costEstimate: 0,
        latencyMs: 0,
        statusCode: 429,
        isAnomaly: false,
        anomalyReason: budgetGuard.blockReason || 'Hard-block limit active',
        // A blocked request is never scored for spikes
        anomalyStatus: 'SKIPPED',
        isBlocked: true,
        // Blocked attempts never store prompt text
        promptPreview: null,
        responsePreview: 'FAIL_CLOSED_GUARDRAIL_BLOCKED',
      },
    });
  }

  private async logSuccessfulRequest(
    reqId: string,
    startedAt: Date,
    req: GatewayChatRequest,
    provider: string,
    adapterResult: any,
    costEstimate: number,
    latencyMs: number,
    promptText: string,
    logContent: boolean,
    reservation: { reservedUsd: number; holdExceeded: boolean; overrunUsd: number; reservationHeld: boolean; estimator: { estimatedInputTokens: number; reservedInputTokens: number; reservedOutputTokens: number; estimatorVersion: string }; price: any },
  ) {
    const data = {
        id: reqId,
        // Same instant as the budget bucket, so ledger month == Redis month
        createdAt: startedAt,
        projectId: req.projectId,
        userId: req.userId || null,
        gatewayKeyId: req.gatewayKey?.id ?? null,
        provider: provider as any,
        model: req.model,
        tokensIn: adapterResult.promptTokens,
        tokensOut: adapterResult.completionTokens,
        totalTokens: adapterResult.totalTokens,
        costEstimate,
        latencyMs,
        statusCode: 200,
        // Spike evaluation is asynchronous: the row starts PENDING and the anomaly worker (or the
        // recovery sweep) moves it to CLEAR / ANOMALY / FAILED. isAnomaly is true only for a confirmed ANOMALY.
        isAnomaly: false,
        anomalyReason: null,
        anomalyStatus: 'PENDING',
        // Attribution: only what the key assigned or the client validly declared; NULL otherwise (never guessed)
        application: req.attribution?.application ?? null,
        team: req.attribution?.team ?? null,
        tags: req.attribution?.tags ?? undefined,
        cachedTokensIn: adapterResult.cachedPromptTokens ?? null,
        // CONFIRMED only when the provider reported both counts; otherwise the figures (and the cost) are estimates
        usageStatus: adapterResult.usageEstimated === true ? 'ESTIMATED' : 'CONFIRMED',
        estimatedInputTokens: reservation.estimator.estimatedInputTokens,
        reservedInputTokens: reservation.estimator.reservedInputTokens,
        reservedOutputTokens: reservation.estimator.reservedOutputTokens,
        estimatorVersion: reservation.estimator.estimatorVersion,
        // Reservation accuracy, queryable (also exposed by the audit log and analytics)
        reservedCostUsd: reservation.reservedUsd,
        reservationOverrunUsd: reservation.overrunUsd,
        isBlocked: false,
        // Prompt/response text is stored only when the project opted in
        promptPreview: logContent ? promptText.slice(0, 300) : null,
        responsePreview: logContent ? adapterResult.responseText.slice(0, 300) : null,
        metadataJson: JSON.stringify({
          clientIp: req.clientIp || '127.0.0.1',
          clientSdk: req.clientSdk || 'spendguard-nestjs-gateway/v2.0',
          isSimulated: adapterResult.isSimulated,
          // How the cost was derived, so it can be audited later
          cachedTokensIn: adapterResult.cachedPromptTokens ?? 0,
          cacheWriteTokens: adapterResult.cacheWriteTokens ?? null,
          reasoningTokens: adapterResult.reasoningTokens ?? null,
          usageEstimated: adapterResult.usageEstimated === true,
          reservedUsd: reservation.reservedUsd,
          reservationHeld: reservation.reservationHeld,
          holdExceeded: reservation.holdExceeded,
          providerFinishReason: adapterResult.providerFinishReason ?? null,
          attribution: req.attribution?.sources ?? null,
          // The exact price row this request was reserved AND settled with (see docs/FINANCIAL_RECONCILIATION.md)
          pricing: {
            inputPerMillion: reservation.price?.inputPricePerMillion ?? null,
            outputPerMillion: reservation.price?.outputPricePerMillion ?? null,
            cachedInputPerMillion: reservation.price?.cachedInputPrice ?? null,
            rowUpdatedAt: reservation.price?.rowUpdatedAt ? new Date(reservation.price.rowUpdatedAt).toISOString() : null,
            source: reservation.price?.source ?? null,
          },
        }),
    };

    try {
      await this.prisma.request.create({ data });
      await this.budgetService.clearPendingPersist(req.projectId, reqId, startedAt);
    } catch (err: any) {
      // The provider call succeeded and Redis is charged: the row must not be
      // dropped. Queue a retry; reconciliation keeps the charge while it is pending.
      // Log codes only — Prisma messages can echo the row (prompt text).
      this.logger.error(`Ledger write failed for request ${reqId} (${err?.code ?? err?.name}); queued for retry`);
      this.count('spendguard_ledger_write_failures_total', { stage: 'db' });
      const job: LedgerRowJob = { ...data, createdAt: startedAt.toISOString() };
      try {
        await this.ledgerQueue.add(PERSIST_REQUEST_JOB, job, { ...PERSIST_REQUEST_JOB_OPTS, jobId: reqId });
      } catch (queueErr: any) {
        this.count('spendguard_ledger_write_failures_total', { stage: 'queue_journal_only' });
        // Last resort, so a charge is never silently lost: one structured line with the FINANCIAL fields only
        // (no prompt, response, headers or credentials) from which the ledger row can be rebuilt by hand.
        this.logger.error(
          `CRITICAL: could not persist or queue ledger row for request ${reqId} (${queueErr?.message}); LEDGER_JOURNAL ${JSON.stringify({
            id: reqId, createdAt: startedAt.toISOString(), projectId: req.projectId, gatewayKeyId: req.gatewayKey?.id ?? null, provider, model: req.model,
            tokensIn: adapterResult.promptTokens, tokensOut: adapterResult.completionTokens, costUsd: costEstimate, usageStatus: data.usageStatus,
            application: req.attribution?.application ?? null, team: req.attribution?.team ?? null,
          })}`,
        );
      }
    }
  }
}
