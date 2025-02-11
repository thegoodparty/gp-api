import { Injectable } from '@nestjs/common'
import Stripe from 'stripe'

const { STRIPE_SECRET_KEY, WEBAPP_ROOT_URL } = process.env
if (!STRIPE_SECRET_KEY || !WEBAPP_ROOT_URL) {
  throw new Error(
    'Please set STRIPE_SECRET_KEY and WEBAPP_ROOT_URL in your .env',
  )
}

const LIVE_PRODUCT_ID = 'prod_QCGFVVUhD6q2Jo'
const TEST_PRODUCT_ID = 'prod_QAR4xrqUhyHHqX'

export const StripeSingleton = new Stripe(STRIPE_SECRET_KEY as string)

@Injectable()
export class StripeService {
  private stripe = StripeSingleton

  private getPrice = async () => {
    const { default_price: price } = await this.stripe.products.retrieve(
      STRIPE_SECRET_KEY?.includes('live') ? LIVE_PRODUCT_ID : TEST_PRODUCT_ID,
    )
    return price
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
}
