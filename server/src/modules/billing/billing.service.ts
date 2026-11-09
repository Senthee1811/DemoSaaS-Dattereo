import { Injectable, Logger } from '@nestjs/common';
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
      this.logger.warn('Billing service running in STUB mode (no STRIPE_SECRET_KEY). Checkout flows will return mock data.');
    }
  }

  /**
   * Create a Stripe Checkout session for a subscription tier.
   */
  async createCheckoutSession(params: {
    orgId: string;
    tier: 'starter' | 'growth' | 'enterprise';
    successUrl: string;
    cancelUrl: string;
  }) {
    let StripePackage: any = null;
    try {
      StripePackage = require('stripe');
    } catch {
      // Package not yet installed in server
    }

    if (StripePackage && !this.isStubMode && this.stripeKey) {
      try {
        const stripe = new StripePackage(this.stripeKey);
        const priceMap: Record<string, number> = {
          starter: 3900,  // $39.00/mo
          growth: 19900,  // $199.00/mo
        };
        const unitAmount = priceMap[params.tier] || 3900;

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
          success_url: `${params.successUrl}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: params.cancelUrl,
        });

        return {
          checkoutUrl: session.url || params.successUrl,
          sessionId: session.id,
          isStub: false,
        };
      } catch (err: any) {
        this.logger.error(`Stripe checkout creation error: ${err.message}. Using safe stub fallback.`);
      }
    }

    this.logger.log(`[STUB] Creating checkout session for org ${params.orgId}, tier: ${params.tier}`);
    return {
      checkoutUrl: `${params.successUrl}?session_id=stub_session_${Date.now()}`,
      sessionId: `stub_session_${Date.now()}`,
      isStub: true,
    };
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

    this.logger.log('[STUB] Webhook received in stub mode — no processing.');
    return { received: true, isStub: true };
  }

  /**
   * Get subscription status for an organization.
   */
  async getSubscription(orgId: string) {
    try {
      // Use raw query to avoid type errors when Prisma client hasn't been regenerated
      const subscriptions = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM subscriptions WHERE org_id = $1 LIMIT 1`,
        orgId,
      );

      const subscription = subscriptions?.[0];

      if (!subscription) {
        return {
          orgId,
          tier: 'starter',
          status: 'free',
          currentPeriodEnd: null,
        };
      }

      return {
        orgId: subscription.org_id,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      };
    } catch {
      // Table may not exist yet — return default free tier
      return {
        orgId,
        tier: 'starter',
        status: 'free',
        currentPeriodEnd: null,
      };
    }
  }
}
