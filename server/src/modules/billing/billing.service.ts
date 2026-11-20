import { Injectable, Logger, BadRequestException, BadGatewayException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Billing service — fully isolated from the cost-engine module.
 * Only shares the Organization table (via orgId FK).
 * 
 * When STRIPE_SECRET_KEY is not set, operates in stub mode
 * and logs actions without calling Stripe.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripeKey: string | undefined;
  private readonly isStubMode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY') || process.env.STRIPE_SECRET_KEY;
    this.isStubMode = !this.stripeKey;

    if (this.isStubMode) {
      this.logger.warn('Billing is not configured (no STRIPE_SECRET_KEY). Checkout returns 503 billing_not_configured.');
    }
  }

  /**
   * Create a Stripe Checkout session for a subscription tier.
   */
  async createCheckoutSession(params: {
    orgId: string;
    tier: 'starter' | 'growth';
    successUrl: string;
    cancelUrl: string;
  }) {
    const priceMap: Record<'starter' | 'growth', number> = {
      starter: 3900,  // $39.00/mo
      growth: 19900,  // $199.00/mo
    };
    const unitAmount = priceMap[params.tier];
    if (!unitAmount) {
      throw new BadRequestException(`Tier '${params.tier}' is not available for self-serve checkout`);
    }
    const withParam = (url: string, key: string, value: string) =>
      `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;

    let StripePackage: any = null;
    try {
      StripePackage = require('stripe');
    } catch {
      // Package not yet installed in server
    }

    if (StripePackage && !this.isStubMode && this.stripeKey) {
      try {
        const stripe = new StripePackage(this.stripeKey);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'subscription',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `SpendGuard AI ${params.tier.toUpperCase()} Plan`,
                  description: `SpendGuard AI FinOps Governance Subscription (${params.tier})`,
                },
                unit_amount: unitAmount,
                recurring: { interval: 'month' },
              },
              quantity: 1,
            },
          ],
          metadata: {
            orgId: params.orgId,
            tier: params.tier,
          },
          success_url: withParam(params.successUrl, 'session_id', '{CHECKOUT_SESSION_ID}'),
          cancel_url: params.cancelUrl,
        });

        return {
          checkoutUrl: session.url || params.successUrl,
          sessionId: session.id,
          isStub: false,
        };
      } catch (err: any) {
        // A configured-but-failing Stripe must not silently pretend checkout succeeded
        this.logger.error(`Stripe checkout creation error: ${err.message}`);
        throw new BadGatewayException('Payment provider is unavailable. Please try again shortly.');
      }
    }

    // No payment provider: say so. Never redirect to ?checkout=success for a purchase that didn't happen.
    throw new HttpException(
      {
        error: {
          message: 'Billing is not configured on this deployment, so plans cannot be purchased yet.',
          type: 'billing_unavailable',
          code: 'billing_not_configured',
        },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * Handle Stripe webhook events for subscription lifecycle.
   */
  async handleWebhook(rawBody: string, signature: string) {
    let StripePackage: any = null;
    try {
      StripePackage = require('stripe');
    } catch {}

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET') || process.env.STRIPE_WEBHOOK_SECRET;

    if (StripePackage && !this.isStubMode && webhookSecret && signature) {
      try {
        const stripe = new StripePackage(this.stripeKey);
        const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        this.logger.log(`Verified Stripe webhook event: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object as any;
          const orgId = session.metadata?.orgId;
          const tier = session.metadata?.tier || 'starter';
          if (orgId) {
            await this.prisma.subscription.upsert({
              where: { orgId },
              update: {
                stripeCustomerId: session.customer || `cus_${Date.now()}`,
                stripeSubscriptionId: session.subscription || `sub_${Date.now()}`,
                tier,
                status: 'active',
              },
              create: {
                orgId,
                stripeCustomerId: session.customer || `cus_${Date.now()}`,
                stripeSubscriptionId: session.subscription || `sub_${Date.now()}`,
                tier,
                status: 'active',
              },
            });
          }
        }
        return { received: true, event: event.type, isStub: false };
      } catch (err: any) {
        this.logger.error(`Stripe webhook signature verification failed: ${err.message}`);
        return { received: false, error: err.message, isStub: false };
      }
    }

    if (!this.isStubMode) {
      // Stripe is live: never accept unsigned / unverifiable webhook payloads
      this.logger.warn('Rejected Stripe webhook without a verifiable signature');
      return { received: false, error: 'Missing or unverifiable Stripe signature', isStub: false };
    }

    this.logger.log('[STUB] Webhook received in stub mode — no processing.');
    return { received: true, isStub: true };
  }

  /**
   * Get subscription status for an organization.
   */
  async getSubscription(orgId: string) {
    try {
      const subscription = await (this.prisma as any).subscription?.findUnique({
        where: { orgId },
      });

      if (!subscription) {
        return {
          orgId,
          tier: 'starter',
          status: 'free',
          currentPeriodEnd: null,
        };
      }

      return {
        orgId: subscription.orgId,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      };
    } catch {
      // Table may not exist yet or query failed — return default free tier
      return {
        orgId,
        tier: 'starter',
        status: 'free',
        currentPeriodEnd: null,
      };
    }
  }
}
