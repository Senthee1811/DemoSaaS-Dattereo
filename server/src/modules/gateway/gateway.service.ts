import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  REQUEST_LEDGER_QUEUE,
  PERSIST_REQUEST_JOB,
  PERSIST_REQUEST_JOB_OPTS,
  LedgerRowJob,
} from './request-ledger.queue';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { PricingService, computeCost } from '@/modules/pricing/pricing.service';
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
  ) {}

  async processChatCompletion(req: GatewayChatRequest) {
    const startTime = Date.now();
    const startedAt = new Date(startTime);
    // One ID for the whole request: budget hold, ledger row and response id.
    const reqId = `req_${randomUUID()}`;
    const provider = this.pricingService.resolveProvider(req.model);
    const promptText = req.messages.map(m => m.content).join(' ');
    const promptTokens = this.pricingService.estimateTokens(promptText);
    const maxTokens = req.maxTokens ?? 1000;
    // Snapshot the price row once (throws 400 model_not_priced for an unknown model, before any
    // hold). The reservation and the settlement below use this same row, so an admin editing or
    // deactivating the model mid-request cannot make settlement fail or use a different rate.
    const priceRow = this.pricingService.requireModelPrice(req.model);
    const maxEstimatedCost = this.pricingService.estimateMaxCost(req.model, promptTokens, maxTokens);

    // 1a. Per-key tokens-per-minute: admit (prompt estimate + max_tokens) before the call
    const estimatedTokens = promptTokens + maxTokens;
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
    const budgetGuard = await this.budgetService.reserveCapacity(
      req.projectId,
      reqId,
      maxEstimatedCost,
      req.gatewayKey ? { id: req.gatewayKey.id, budgetMonthly: req.gatewayKey.budgetMonthly } : undefined,
    );

    if (!budgetGuard.canProceed) {
      await releaseTpm();
      // Log blocked attempt into audit ledger (async)
      this.logBlockedRequest(reqId, req, provider, budgetGuard).catch(err =>
        this.logger.warn(`Could not log blocked request: ${err.message}`),
      );

      const isGovernanceUnavailable = budgetGuard.blockReason?.includes('Governance engine unavailable');
      const errorCode = isGovernanceUnavailable ? 'governance_unavailable' : (budgetGuard.blockCode ?? 'budget_exceeded');
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
      // Release this request's hold so failures do not drain the project cap
      await this.budgetService.releaseHold(hold);
      await releaseTpm();
      throw upstreamErr;
    }

    const latencyMs = Date.now() - startTime;
    // Actual cost from provider-reported usage: cached input at the cached rate, reasoning tokens
    // already inside completionTokens (adapters normalise this).
    const costEstimate = computeCost(priceRow, adapterResult.promptTokens, adapterResult.completionTokens, {
      cachedTokens: adapterResult.cachedPromptTokens,
      cacheWriteTokens: adapterResult.cacheWriteTokens,
    });
    // Reservation vs reality. Output is bounded by max_tokens at every provider, so actual cost
    // should fit the hold; if it does not (a provider ignored the limit, or the prompt estimate
    // was low), settlement still charges the ACTUAL cost and the overrun is made visible.
    const reservedUsd = hold.amount;
    const holdExceeded = reservedUsd > 0 && costEstimate > reservedUsd + 1e-9;
    if (holdExceeded) {
      this.logger.warn(
        `Request ${reqId} cost $${costEstimate.toFixed(6)} exceeded its hold $${reservedUsd.toFixed(6)} (model ${req.model}); actual cost charged.`,
      );
    }

    // 4. Reconcile atomic reservation with verified actual usage
    // Marked pending BEFORE settling, so reconciliation can never lower spend
    // below this charge while its ledger row is still being written.
    await this.budgetService.markPendingPersist(req.projectId, reqId, startedAt);
    const settled = await this.budgetService.settleHold(hold, costEstimate);
    // TPM counts what was actually used, not the pre-call estimate
    if (tpm) await this.redisService.adjustTpm(tpm.counterKey, adapterResult.totalTokens - estimatedTokens);
    if (!settled) {
      // Redis lost mid-request: the hold expires on its own and the scheduled
      // DB reconciliation restores the true spend counter from the ledger.
      this.logger.error(`Spend settlement failed for request ${reqId} (project ${req.projectId}); reconciliation job will correct it.`);
    }

    // 5. Append-only ledger row — written BEFORE the response is returned
    await this.logSuccessfulRequest(reqId, startedAt, req, provider, adapterResult, costEstimate, latencyMs, promptText, budgetGuard.logRequestContent === true, { reservedUsd, holdExceeded });

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
          finish_reason: 'stop',
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
        // Spike scoring is asynchronous now, so it is unknown when the response is sent. The
        // fields stay for client compatibility; the result lands on the ledger row and alerts.
        is_anomaly: false,
        anomaly_reason: null,
        project_id: req.projectId,
        budget_remaining_usd: Number(budgetRemaining.toFixed(2)),
        fail_closed_active: true,
      },
      headers: {
        'X-SpendGuard-Cost': costEstimate.toFixed(6),
        'X-SpendGuard-Latency': String(latencyMs),
        'X-SpendGuard-Blocked': 'false',
      },
    };
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
    reservation: { reservedUsd: number; holdExceeded: boolean },
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
        // Set later by the anomaly worker when the request turns out to be a spike
        isAnomaly: false,
        anomalyReason: null,
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
          holdExceeded: reservation.holdExceeded,
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
      const job: LedgerRowJob = { ...data, createdAt: startedAt.toISOString() };
      try {
        await this.ledgerQueue.add(PERSIST_REQUEST_JOB, job, { ...PERSIST_REQUEST_JOB_OPTS, jobId: reqId });
      } catch (queueErr: any) {
        this.logger.error(`CRITICAL: could not queue ledger retry for request ${reqId}: ${queueErr?.message}`);
      }
    }
  }
}
