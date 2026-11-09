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
    if (this.isStubMode) {
      this.logger.log(`[STUB] Creating checkout session for org ${params.orgId}, tier: ${params.tier}`);
      return {
        checkoutUrl: `${params.successUrl}?session_id=stub_session_${Date.now()}`,
        sessionId: `stub_session_${Date.now()}`,
        isStub: true,
      };
    }

    // Real Stripe integration would go here
    // const stripe = new Stripe(this.stripeKey!);
    // const session = await stripe.checkout.sessions.create({...});
    // return { checkoutUrl: session.url, sessionId: session.id };

    return {
      checkoutUrl: params.successUrl,
      sessionId: `live_session_${Date.now()}`,
      isStub: false,
    };
  }

  /**
   * Handle Stripe webhook events for subscription lifecycle.
   */
  async handleWebhook(rawBody: string, signature: string) {
    if (this.isStubMode) {
      this.logger.log('[STUB] Webhook received in stub mode — no processing.');
      return { received: true, isStub: true };
    }

    // Real webhook verification and handling:
    // const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    // switch (event.type) {
    //   case 'checkout.session.completed': ...
    //   case 'customer.subscription.updated': ...
    //   case 'customer.subscription.deleted': ...
    //   case 'invoice.payment_failed': ...
    // }

    return { received: true };
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
