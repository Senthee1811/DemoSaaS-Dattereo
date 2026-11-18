import { Controller, Post, Get, Body, Headers, Req, Res, HttpStatus, RawBodyRequest, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { IsString, IsIn } from 'class-validator';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';

export class CreateCheckoutDto {
  @IsString()
  @IsIn(['starter', 'growth', 'enterprise'])
  tier: 'starter' | 'growth' | 'enterprise';
}

@ApiTags('Platform Billing (Stripe)')
@ApiBearerAuth()
@Controller('api/v1/billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Create Stripe Checkout session for a self-serve subscription tier' })
  @ApiResponse({ status: 201, description: 'Checkout session created' })
  async createCheckout(@Body() dto: CreateCheckoutDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.tier === 'enterprise') {
      throw new BadRequestException('Enterprise plans are provisioned by our sales team. Please use "Contact Enterprise Sales".');
    }
    // Redirect URLs are server-controlled to prevent open-redirects via checkout
    const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    return this.billingService.createCheckoutSession({
      orgId: user.orgId,
      tier: dto.tier,
      successUrl: `${appUrl}/dashboard?checkout=success`,
      cancelUrl: `${appUrl}/dashboard?checkout=cancelled`,
    });
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Handle Stripe webhook events for subscription lifecycle' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Res() res: Response,
  ) {
    if (!req.rawBody) {
      return res.status(HttpStatus.BAD_REQUEST).json({ received: false, error: 'Missing raw body' });
    }
    const result = await this.billingService.handleWebhook(req.rawBody.toString('utf8'), signature);
    return res.status(result.received ? HttpStatus.OK : HttpStatus.BAD_REQUEST).json(result);
  }

  @Get('subscription')
  @ApiOperation({ summary: "Get the caller organization's subscription status" })
  @ApiResponse({ status: 200, description: 'Subscription details' })
  async getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getSubscription(user.orgId);
  }
}
