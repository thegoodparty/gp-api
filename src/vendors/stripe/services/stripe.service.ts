import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import Stripe from 'stripe'
import { User } from '@prisma/client'
import { PaymentIntentPayload, PaymentType } from 'src/payments/payments.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'

const { STRIPE_SECRET_KEY, WEBAPP_ROOT_URL, STRIPE_WEBSOCKET_SECRET } =
  process.env
if (!STRIPE_SECRET_KEY || !WEBAPP_ROOT_URL) {
  throw new Error(
    'Please set STRIPE_SECRET_KEY and WEBAPP_ROOT_URL in your .env',
  )
}

if (!STRIPE_WEBSOCKET_SECRET) {
  throw new Error('Please set STRIPE_WEBSOCKET_SECRET in your .env')
}

const LIVE_PRODUCT_ID = 'prod_QCGFVVUhD6q2Jo'
const TEST_PRODUCT_ID = 'prod_QAR4xrqUhyHHqX'

@Injectable()
export class StripeService {
  private stripe = new Stripe(STRIPE_SECRET_KEY as string)
  readonly isTestMode = !STRIPE_SECRET_KEY?.includes('live')
  private readonly logger = new Logger(StripeService.name)

  constructor(private readonly slack: SlackService) {}

  private getPrice = async () => {
    const { default_price: price } = await this.stripe.products.retrieve(
      STRIPE_SECRET_KEY?.includes('live') ? LIVE_PRODUCT_ID : TEST_PRODUCT_ID,
    )
    return price
  }

  async createPaymentIntent<T extends PaymentType>(
    user: User,
    { amount, description, type, ...restMetadata }: PaymentIntentPayload<T>,
  ) {
    const userId = user.id
    const customerId = user.metaData?.customerId

    // Filter out undefined values from metadata before passing to Stripe
    const cleanedMetadata = Object.entries(restMetadata)
      .filter(([_, value]) => value !== undefined)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})

    return await this.stripe.paymentIntents.create({
      customer: customerId,
      amount: Math.floor(amount), // Stripe expects an integer of cents
      currency: 'usd',
      description,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId,
        paymentType: type,
        ...(cleanedMetadata as Record<string, string | number>),
      },
    })
  }

  async retrievePaymentIntent(paymentId: string) {
    return await this.stripe.paymentIntents.retrieve(paymentId)
  }

  async createCheckoutSession(userId: number) {
    const session = await this.stripe.checkout.sessions.create({
      metadata: {
        userId,
      },
      billing_address_collection: 'auto',
      line_items: [
        {
          // We should never have more than 1 price for Pro. But if we do, this
          //  will need to be more intelligent.
          price: (await this.getPrice()) as string,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      // Expanding for Segment / analytics
      expand: [
        'subscription',
        'subscription.items.data.price',
        'payment_intent.payment_method',
      ],
      success_url: `${WEBAPP_ROOT_URL}/dashboard/pro-sign-up/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEBAPP_ROOT_URL}/dashboard`,
    })

    const { url: redirectUrl, id: checkoutSessionId } = session
    return { redirectUrl, checkoutSessionId }
  }

  async createPortalSession(customerId: string) {
    return await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${WEBAPP_ROOT_URL}/profile`,
    })
  }

  async setSubscriptionCancelAt(subscriptionId: string, cancelAt: Date) {
    try {
      await this.stripe.subscriptions.update(subscriptionId, {
        // Stripe API throws cryptic error if an int is not sent here
        cancel_at: Math.floor(cancelAt.getTime() / 1000),
      })
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error('Error setting subscription cancel at', e)
        await this.slack.errorMessage({
          message: 'Error setting subscription cancel at',
          error: { subscriptionId, cancelAt, error: e },
        })

        throw new BadGatewayException('Error updating subscription', e.message)
      }
      throw e
    }
  }

  async parseWebhookEvent(rawBody: Buffer, stripeSignature: string) {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      stripeSignature,
      STRIPE_WEBSOCKET_SECRET as string,
    )
  }
  
  async fetchCustomerIdFromCheckoutSession(
    checkoutSessionId: string,
  ): Promise<string | null> {
    const checkoutSession =
      await this.stripe.checkout.sessions.retrieve(checkoutSessionId)

    if (checkoutSession.payment_status !== 'paid') {
      this.logger.warn(
        `Checkout session ${checkoutSessionId} has status: ${checkoutSession.payment_status}`,
      )
      return null
    }

    const { customer } = checkoutSession

    // Handle all possible customer field types from Stripe API
    if (!customer) {
      return null
    }

    // If customer is a string, it's the customer ID
    if (typeof customer === 'string') {
      return customer
    }

    // If customer is an expanded Customer object, extract the ID
    return customer.id
  }
}
