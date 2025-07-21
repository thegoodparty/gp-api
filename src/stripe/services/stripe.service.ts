import { BadGatewayException, Injectable } from '@nestjs/common'
import Stripe from 'stripe'
import { User } from '@prisma/client'
import { PaymentIntentPayload, PaymentType } from 'src/payments/payments.types'

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

    // Validate that no undefined values are passed to Stripe metadata
    const undefinedKeys = Object.entries(restMetadata)
      .filter(([_, value]) => value === undefined)
      .map(([key]) => key)
    if (undefinedKeys.length > 0) {
      throw new Error(
        `Cannot pass undefined values to Stripe metadata. Found undefined values for: ${undefinedKeys.join(', ')}`,
      )
    }

    return await this.stripe.paymentIntents.create({
      customer: customerId,
      amount,
      currency: 'usd',
      description,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        userId,
        paymentType: type,
        ...(restMetadata as Record<string, string | number>),
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
}
