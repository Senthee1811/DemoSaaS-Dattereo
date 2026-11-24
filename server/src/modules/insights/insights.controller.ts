import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { AttributionService } from './attribution.service';
import { ForecastService } from './forecast.service';
import { InvestigationService } from './investigation.service';
import { ModelComparisonService } from './model-comparison.service';
import { RecommendationAction, RecommendationsService } from './recommendations.service';

/** ISO start of "the last N <unit>", or undefined when not asked for. Bad values are a 400, never silently clamped. */
function relativeStart(raw: string | undefined, min: number, max: number, unit: string, unitMs: number): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${unit} must be a whole number between ${min} and ${max}`);
  return new Date(Date.now() - n * unitMs).toISOString();
}

/**
 * Financial intelligence. Every endpoint reads the spend ledger for the CALLER's organization only (the org id comes
 * from the authenticated token, never from the request) and returns deterministic, explainable numbers.
 */
@ApiTags('Financial Intelligence')
@ApiBearerAuth()
@Controller('api/v1/insights')
export class InsightsController {
  constructor(
    private readonly attribution: AttributionService,
    private readonly forecasts: ForecastService,
    private readonly investigations: InvestigationService,
    private readonly comparison: ModelComparisonService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get('attribution')
  @ApiOperation({ summary: 'Where the money goes: spend by project, key, application, team, provider or model' })
  attribute(@CurrentUser() u: AuthenticatedUser, @Query('dimension') dimension = 'model', @Query('projectId') projectId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('days') days?: string) {
    // `days` = "the last N days up to now", so a browser never has to compute timestamps (explicit from/to still win)
    const lookback = relativeStart(days, 1, 92, 'days', 86_400_000);
    return this.attribution.attribute(u.orgId, { dimension, projectId, from: from ?? lookback, to });
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Month-end spend forecast with range, data sufficiency and budget status (actual and predicted kept apart)' })
  forecast(@CurrentUser() u: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.forecasts.forecast(u.orgId, projectId);
  }

  @Get('investigation')
  @ApiOperation({ summary: 'What changed, when and why: a window against its baseline, every claim tied to ledger rows' })
  investigate(@CurrentUser() u: AuthenticatedUser, @Query('projectId') projectId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('baselineDays') baselineDays?: string, @Query('hours') hours?: string) {
    const lookback = relativeStart(hours, 1, 24 * 31, 'hours', 3_600_000);
    return this.investigations.investigate(u.orgId, { projectId, from: from ?? lookback, to, baselineDays: baselineDays ? Number(baselineDays) : undefined });
  }

  @Get('model-comparison')
  @ApiOperation({ summary: 'Re-price historical traffic on other models (cost only; quality is not assessed)' })
  compare(@CurrentUser() u: AuthenticatedUser, @Query('projectId') projectId?: string, @Query('days') days?: string, @Query('models') models?: string) {
    return this.comparison.compare(u.orgId, { projectId, days: days ? Number(days) : undefined, models: models ? models.split(',').map((m) => m.trim()).filter(Boolean).slice(0, 20) : undefined });
  }

  @Get('recommendations')
  list(@CurrentUser() u: AuthenticatedUser, @Query('status') status?: string, @Query('projectId') projectId?: string) {
    return this.recommendations.list(u.orgId, { status, projectId });
  }

  @Post('recommendations/refresh')
  @Roles('OWNER', 'ADMIN')
  @ApiOperation({ summary: 'Re-evaluate every rule now' })
  refresh(@CurrentUser() u: AuthenticatedUser) {
    return this.recommendations.generate(u.orgId);
  }

  @Patch('recommendations/:id')
  @ApiOperation({ summary: 'Record a human decision: acknowledge, dismiss, or approve a model evaluation (owner/admin). Changes no configuration.' })
  decide(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { action?: RecommendationAction; note?: string }) {
    return this.recommendations.decide(u.orgId, u, id, body?.action as RecommendationAction, typeof body?.note === 'string' ? body.note : undefined);
  }
}
