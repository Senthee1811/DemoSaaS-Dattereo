import { Controller, Get, Post, Body, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';

/**
 * The pricing catalog is shared by every tenant, so writes are restricted to
 * platform operators (PLATFORM_ADMIN_EMAILS), not to any organization OWNER.
 */
function isPlatformAdmin(email: string): boolean {
  const admins = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes((email || '').toLowerCase());
}

@ApiTags('Model Pricing')
@Controller('api/v1/pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all supported model rates and configurations' })
  async getPricingCatalog() {
    const { models, meta } = await this.pricingService.listPrices();
    return {
      status: 'success',
      data: models,
      meta,
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upsert or override dynamic model pricing rate (platform admins only)' })
  async updatePricing(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      model: string;
      provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'GROQ';
      inputPricePerMillion: number;
      outputPricePerMillion: number;
      cachedInputPrice?: number;
      displayName?: string;
      contextWindow?: number;
    },
  ) {
    if (!isPlatformAdmin(user.email)) {
      throw new ForbiddenException('Only platform administrators can change the shared pricing catalog.');
    }
    const updated = await this.pricingService.upsertModelPrice(body);
    return {
      status: 'success',
      message: `Pricing updated for ${body.model}`,
      data: updated,
    };
  }
}
