import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/decorators/roles.decorator';

@ApiTags('Model Pricing')
@Controller('api/v1/pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  @ApiOperation({ summary: 'List all supported model rates and configurations' })
  getPricingCatalog() {
    return {
      status: 'success',
      data: this.pricingService.getAllPrices(),
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upsert or override dynamic model pricing rate (Admin only)' })
  async updatePricing(
    @Body()
    body: {
      model: string;
      provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
      inputPricePerMillion: number;
      outputPricePerMillion: number;
      displayName?: string;
      contextWindow?: number;
    },
  ) {
    const updated = await this.pricingService.upsertModelPrice(body);
    return {
      status: 'success',
      message: `Pricing updated for ${body.model}`,
      data: updated,
    };
  }
}
