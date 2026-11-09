import { Controller, Post, Get, Body, Query, Headers, Req, Res, HttpStatus, RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { IsString, IsIn, IsUrl, IsOptional } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  orgId: string;

  @IsString()
  @IsIn(['starter', 'growth', 'enterprise'])
  tier: 'starter' | 'growth' | 'enterprise';

  @IsUrl()
  @IsOptional()
  successUrl?: string;

  @IsUrl()
  @IsOptional()
  cancelUrl?: string;
}

@ApiTags('Platform Billing (Stripe)')
@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Create Stripe Checkout session for subscription tier' })
  @ApiResponse({ status: 200, description: 'Checkout session created' })
  async createCheckout(@Body() dto: CreateCheckoutDto) {
    return this.billingService.createCheckoutSession({
      orgId: dto.orgId,
      tier: dto.tier,
      successUrl: dto.successUrl || 'http://localhost:3000/dashboard?checkout=success',
      cancelUrl: dto.cancelUrl || 'http://localhost:3000/dashboard?checkout=cancelled',
    });
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle Stripe webhook events for subscription lifecycle' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const result = await this.billingService.handleWebhook(rawBody, signature);
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get subscription status for an organization' })
  @ApiResponse({ status: 200, description: 'Subscription details' })
  async getSubscription(@Query('orgId') orgId: string) {
    return this.billingService.getSubscription(orgId);
  }
}
