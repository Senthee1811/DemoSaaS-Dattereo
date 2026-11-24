import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { ForecastService } from './forecast.service';
import { InvestigationService } from './investigation.service';
import { ModelComparisonService } from './model-comparison.service';
import { InsightsDataService } from './insights.data';
import { budgetRiskRule, highTokenApplicationRule, modelConcentrationRule, modelEvaluationRule, RecommendationDraft, spendIncreaseRule } from './calc/recommendation.rules';

export type RecommendationAction = 'acknowledge' | 'approve_evaluation' | 'dismiss';
const DISMISS_DAYS = 14;
const DAY = 86_400_000;

/**
 * Generates recommendations from the ledger with deterministic rules (calc/recommendation.rules.ts), keeps their
 * lifecycle, and records human decisions. It never changes a customer's model configuration: approving a model
 * evaluation records WHO decided and WHEN, nothing else.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: InsightsDataService,
    private readonly forecasts: ForecastService,
    private readonly investigations: InvestigationService,
    private readonly comparisons: ModelComparisonService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Generation ────────────────────────────────────────────────────────────
  /** Evaluates every rule for every project of the org, then reconciles with what is stored. */
  async generate(orgId: string, now = new Date()): Promise<{ created: number; updated: number; resolved: number; evaluatedProjects: number }> {
    const projects = await this.prisma.project.findMany({ where: { orgId }, select: { id: true, name: true } });
    const drafts: RecommendationDraft[] = [];
    for (const p of projects) {
      try {
        drafts.push(...(await this.draftsForProject(orgId, p.id, p.name, now)));
      } catch (err: any) {
        // One project's failure must not hide the others' findings
        this.logger.warn(`Recommendation rules failed for project ${p.id}: ${err?.message}`);
      }
    }
    return { ...(await this.reconcile(orgId, drafts, projects.map((p) => p.id), now)), evaluatedProjects: projects.length };
  }

  async draftsForProject(orgId: string, projectId: string, projectName: string, now: Date): Promise<RecommendationDraft[]> {
    const drafts: (RecommendationDraft | null)[] = [];

    // Recent window vs the baseline before it (last 7 days vs the 28 before)
    const inv = await this.investigations.investigate(orgId, { projectId, from: new Date(now.getTime() - 7 * DAY).toISOString(), to: now.toISOString(), baselineDays: 28 }, now);
    drafts.push(
      spendIncreaseRule({
        projectId, projectName, windowDays: 7, decomposition: inv.decomposition, historical: inv.historical, baselineSufficiency: inv.sufficiency,
        topContributors: Object.entries(inv.contributors).flatMap(([dimension, list]) => list.filter((c) => c.deltaUsd > 0).slice(0, 2).map((c) => ({ dimension, label: c.label, deltaUsd: c.deltaUsd }))),
        evidenceRequestIds: inv.evidence.topRequests.map((r) => r.id),
      }),
    );

    // Budget risk
    drafts.push(budgetRiskRule({ projectId, projectName, forecast: await this.forecasts.forecast(orgId, projectId, now) }));

    // Models: concentration and cheaper-model evaluation (30 days)
    const days = 30;
    const [usage, keyed] = await Promise.all([this.data.modelUsage(orgId, projectId, new Date(now.getTime() - days * DAY), 5), this.data.providersWithKeys(orgId, projectId)]);
    drafts.push(modelConcentrationRule({ projectId, projectName, days, models: usage.groups.map((g) => ({ model: g.model, spendUsd: g.actualCostUsd, requests: g.requests })) }));
    for (const group of usage.groups) {
      const best = this.comparisons.compareGroup(group, keyed)[0];
      if (best) drafts.push(modelEvaluationRule({ projectId, projectName, days, group, best }));
    }

    // Applications with unusually long prompts/replies (only when attribution exists)
    const apps = (await this.data.members(orgId, projectId, new Date(now.getTime() - days * DAY), now, 'application')).filter((m) => m.key !== null);
    drafts.push(
      highTokenApplicationRule({
        projectId, projectName, days,
        apps: apps.map((a) => ({ application: a.key as string, requests: a.requests, tokens: a.tokensIn + a.tokensOut, avgTokensPerRequest: a.requests ? (a.tokensIn + a.tokensOut) / a.requests : 0, costUsd: a.costUsd })),
      }),
    );
    return drafts.filter((d): d is RecommendationDraft => d !== null);
  }

  /**
   * Upserts drafts by fingerprint, honours human decisions, and resolves findings whose condition no longer holds.
   *  - an existing OPEN/ACKNOWLEDGED/APPROVED finding is refreshed in place (no duplicates);
   *  - a DISMISSED finding stays dismissed until `dismissedUntil`;
   *  - a RESOLVED finding that recurs is reopened as OPEN;
   *  - OPEN findings that were not produced this run become RESOLVED (decided ones are left alone).
   */
  async reconcile(orgId: string, drafts: RecommendationDraft[], scopedProjectIds: string[], now: Date) {
    const existing = await this.prisma.recommendation.findMany({ where: { orgId } });
    const byFp = new Map(existing.map((r) => [r.fingerprint, r]));
    const seen = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const d of drafts) {
      seen.add(d.fingerprint);
      const common = {
        projectId: d.projectId, type: d.type, severity: d.severity, title: d.title, summary: d.summary, evidence: d.evidence as Prisma.InputJsonValue, method: d.method,
        impactLowUsd: d.impactLowUsd, impactHighUsd: d.impactHighUsd, impactBasis: d.impactBasis, confidence: d.confidence, action: d.action, requiresApproval: d.requiresApproval, lastSeenAt: now,
      };
      const prev = byFp.get(d.fingerprint);
      if (!prev) {
        const row = await this.prisma.recommendation.create({ data: { orgId, fingerprint: d.fingerprint, status: 'OPEN', firstSeenAt: now, ...common } });
        created++;
        this.announce(orgId, row.id, d);
        continue;
      }
      if (prev.status === 'DISMISSED' && prev.dismissedUntil && prev.dismissedUntil > now) continue; // honour the dismissal
      const reopen = prev.status === 'RESOLVED' || (prev.status === 'DISMISSED' && (!prev.dismissedUntil || prev.dismissedUntil <= now));
      await this.prisma.recommendation.update({
        where: { id: prev.id },
        data: reopen ? { ...common, status: 'OPEN', firstSeenAt: now, decidedById: null, decidedAt: null, decisionNote: null, dismissedUntil: null } : common,
      });
      updated++;
      if (reopen) this.announce(orgId, prev.id, d);
    }

    const stale = existing.filter((r) => r.status === 'OPEN' && !seen.has(r.fingerprint) && (!r.projectId || scopedProjectIds.includes(r.projectId)));
    if (stale.length) await this.prisma.recommendation.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: 'RESOLVED' } });
    return { created, updated, resolved: stale.length };
  }

  /** Only warning/critical findings are announced; info-level ones wait to be looked at. Failure never affects generation. */
  private announce(orgId: string, recommendationId: string, d: RecommendationDraft) {
    if (d.severity === 'info') return;
    // Wrapped so that a throwing or non-promise publish can never break recommendation generation
    Promise.resolve()
      .then(() => this.notifications.publish({
        id: `rec:${recommendationId}:${d.fingerprint}`.slice(0, 120),
        type: 'recommendation.created',
        orgId,
        occurredAt: new Date().toISOString(),
        data: { title: d.title, message: d.summary, severity: d.severity, recommendationType: d.type, projectId: d.projectId, impactLowUsd: d.impactLowUsd, impactHighUsd: d.impactHighUsd, confidence: d.confidence },
      }))
      .catch((err: any) => this.logger.warn(`Could not publish recommendation event: ${err?.message}`));
  }

  // ── Reading and deciding ──────────────────────────────────────────────────
  async list(orgId: string, q: { status?: string; projectId?: string }) {
    if (q.projectId) await this.data.assertScope(orgId, q.projectId);
    const statuses = q.status ? q.status.split(',').map((s) => s.trim().toUpperCase()) : ['OPEN', 'ACKNOWLEDGED', 'APPROVED_FOR_EVALUATION'];
    const rows = await this.prisma.recommendation.findMany({
      where: { orgId, status: { in: statuses }, ...(q.projectId ? { projectId: q.projectId } : {}) },
      orderBy: [{ lastSeenAt: 'desc' }],
      include: { project: { select: { name: true } } },
      take: 200,
    });
    const sev = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
    return {
      recommendations: rows
        .sort((a, b) => (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3))
        .map((r) => ({
          id: r.id, type: r.type, status: r.status, severity: r.severity, projectId: r.projectId, projectName: r.project?.name ?? null,
          title: r.title, summary: r.summary, evidence: r.evidence, method: r.method,
          impact: r.impactLowUsd === null ? null : { lowUsd: Number(r.impactLowUsd), highUsd: Number(r.impactHighUsd), basis: r.impactBasis },
          confidence: r.confidence, action: r.action, requiresApproval: r.requiresApproval,
          firstSeenAt: r.firstSeenAt, lastSeenAt: r.lastSeenAt, decidedAt: r.decidedAt, decisionNote: r.decisionNote, dismissedUntil: r.dismissedUntil,
        })),
    };
  }

  /**
   * A human decision. acknowledge/dismiss are open to any member who can read; approving a model evaluation needs
   * OWNER or ADMIN. It records the decision only; no model configuration is touched anywhere.
   */
  async decide(orgId: string, user: { id: string; role: string }, id: string, action: RecommendationAction, note?: string, now = new Date()) {
    const rec = await this.prisma.recommendation.findFirst({ where: { id, orgId } }); // org-scoped: another tenant's id is a 404
    if (!rec) throw new NotFoundException('Recommendation not found');
    if (!['acknowledge', 'approve_evaluation', 'dismiss'].includes(action)) throw new BadRequestException('action must be acknowledge, approve_evaluation or dismiss');
    if (action === 'approve_evaluation') {
      if (!rec.requiresApproval) throw new BadRequestException('This recommendation does not involve an approval.');
      if (!['OWNER', 'ADMIN'].includes(user.role)) throw new ForbiddenException('Only an owner or admin can approve a model evaluation.');
    }
    const status = action === 'acknowledge' ? 'ACKNOWLEDGED' : action === 'approve_evaluation' ? 'APPROVED_FOR_EVALUATION' : 'DISMISSED';
    const updated = await this.prisma.recommendation.update({
      where: { id },
      data: { status, decidedById: user.id, decidedAt: now, decisionNote: note?.slice(0, 500) ?? null, dismissedUntil: action === 'dismiss' ? new Date(now.getTime() + DISMISS_DAYS * DAY) : null },
    });
    return { id: updated.id, status: updated.status, decidedAt: updated.decidedAt, note: 'Decision recorded. SpendGuard does not change any model configuration.' };
  }
}
