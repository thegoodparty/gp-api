import { BadGatewayException, Injectable } from '@nestjs/common'
import { User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import {
  CustomCheckoutSessionPayload,
  PaymentIntentPayload,
  PaymentType,
  PurchaseIntentPayloadEntry,
} from 'src/payments/payments.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import Stripe from 'stripe'

import { requireEnv } from 'src/shared/utils/env'

const STRIPE_SECRET_KEY = requireEnv('STRIPE_SECRET_KEY')
const WEBAPP_ROOT_URL = requireEnv('WEBAPP_ROOT_URL')
const STRIPE_WEBSOCKET_SECRET = requireEnv('STRIPE_WEBSOCKET_SECRET')

const LIVE_PRODUCT_ID = 'prod_QCGFVVUhD6q2Jo'
const TEST_PRODUCT_ID = 'prod_QAR4xrqUhyHHqX'

@Injectable()
export class StripeService {
  private stripe = new Stripe(STRIPE_SECRET_KEY)

  constructor(
    private readonly slack: SlackService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StripeService.name)
  }

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

    const cleanedMetadata = Object.entries(restMetadata)
      .filter(
        ([_, value]: [string, PurchaseIntentPayloadEntry]) => value != null,
      )
      .reduce(
        (acc, [key, value]: [string, PurchaseIntentPayloadEntry]) => ({
          ...acc,
          [key]: value,
        }),
        {},
      )

    return await this.stripe.paymentIntents.create({
      customer: customerId,
      amount: Math.floor(amount), // Stripe expects an integer of cents
      currency: 'usd',
      description,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        ...(cleanedMetadata as Record<string, string | number>),
        userId,
        paymentType: type,
      },
    })
  }

  async retrievePaymentIntent(paymentId: string) {
    return await this.stripe.paymentIntents.retrieve(paymentId)
  }

  async updatePaymentIntentMetadata(
    paymentIntentId: string,
    metadata: Record<string, string>,
  ) {
    return await this.stripe.paymentIntents.update(paymentIntentId, {
      metadata,
    })
  }

  async retrieveCheckoutSession(sessionId: string) {
    return await this.stripe.checkout.sessions.retrieve(sessionId)
  }

  async createCheckoutSession(userId: number, email: string | null = null) {
    const session = await this.stripe.checkout.sessions.create({
      metadata: {
        userId,
      },
      ...(email ? { customer_email: email } : {}),
      billing_address_collection: 'auto',
      line_items: [
        {
          // We should never have more than 1 price for Pro. But if we do, this
          //  will need to be more intelligent.
          // Stripe SDK uses broad union types — e.g. customer can be string | Customer | DeletedCustomer
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          price: (await this.getPrice()) as string,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: true,
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

  async createCustomCheckoutSession(
    {
      id: userId,
      email,
      customerId,
    }: Pick<User, 'id' | 'email'> &
      Pick<NonNullable<User['metaData']>, 'customerId'>,
    payload: CustomCheckoutSessionPayload,
  ): Promise<{
    id: string
    clientSecret: string
    amount: number
  }> {
    const cleanedMetadata = Object.entries(payload.metadata || {})
      .filter(([_, value]) => value != null)
      .reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: String(value),
        }),
        {},
      )

    const session = await this.stripe.checkout.sessions.create({
      ui_mode: 'custom',
      mode: 'payment',
      ...(customerId
        ? { customer: customerId }
        : email
          ? { customer_email: email }
          : {}),
      ...(email ? { payment_intent_data: { receipt_email: email } } : {}),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: payload.productName,
              ...(payload.productDescription
                ? { description: payload.productDescription }
                : {}),
            },
            unit_amount: Math.floor(payload.amount), // Stripe expects cents as integer
          },
          quantity: 1,
        },
      ],
      ...(payload.allowPromoCodes ? { allow_promotion_codes: true } : {}),
      return_url: payload.returnUrl,
      metadata: {
        ...cleanedMetadata,
        userId: String(userId),
        paymentType: payload.type,
        purchaseType: payload.purchaseType,
      },
    })

    if (!session.client_secret) {
      throw new BadGatewayException(
        'Failed to create checkout session: no client_secret returned',
      )
    }

    return {
      id: session.id,
      clientSecret: session.client_secret,
      amount:
        session.amount_total != null
          ? session.amount_total / 100
          : payload.amount / 100,
    }
  }

  async createPortalSession(customerId: string) {
    return await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${WEBAPP_ROOT_URL}/profile`,
    })
  }

  async parseWebhookEvent(rawBody: Buffer, stripeSignature: string) {
    return this.stripe.webhooks.constructEvent(
      rawBody,
      stripeSignature,
      STRIPE_WEBSOCKET_SECRET,
    )
  }

  async fetchCustomerIdFromCheckoutSession(
    checkoutSessionId: string,
  ): Promise<string | null> {
    let checkoutSession: Stripe.Checkout.Session
    try {
      checkoutSession =
        await this.stripe.checkout.sessions.retrieve(checkoutSessionId)
    } catch (error) {
      this.logger.error(
        { error },
        `Failed to retrieve checkout session ${checkoutSessionId}`,
      )
      throw new BadGatewayException(
        'Failed to retrieve checkout session from Stripe',
      )
    }

    if (checkoutSession.payment_status !== 'paid') {
      this.logger.warn(
        `Checkout session ${checkoutSessionId} has status: ${checkoutSession.payment_status}`,
      )
      return null
    }

    const { customer } = checkoutSession

    if (!customer) {
      return null
    }

    if (typeof customer === 'string') {
      return customer
    }

    return customer.id
  }

  async fetchCustomerIdByEmail(email: string): Promise<string | null> {
    try {
      const customers = await this.stripe.customers.list({ email, limit: 1 })
      const first = customers.data[0]
      return first ? first.id : null
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e, `Failed to list customers by email ${email}`)
        throw new BadGatewayException(
          `Failed to query Stripe customers by email ${email}`,
          e.message,
        )
      }
      throw e
    }
  }

  async listActiveSubscriptionCustomerEmails(): Promise<string[]> {
    const emails = new Set<string>()
    let startingAfter: string | undefined = undefined
    try {
      do {
        const response: Stripe.ApiList<Stripe.Subscription> =
          await this.stripe.subscriptions.list({
            status: 'active',
            limit: 100,
            expand: ['data.customer'],
            starting_after: startingAfter,
          })

        for (const subscription of response.data) {
          // Stripe SDK uses broad union types — e.g. customer can be string | Customer | DeletedCustomer
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const customer = subscription.customer as Stripe.Customer
          const email = customer?.email
          if (email) {
            emails.add(email.toLowerCase())
          }
        }

        const last =
          response.data.length > 0
            ? response.data[response.data.length - 1]
            : undefined
        startingAfter = response.has_more && last ? last.id : undefined
      } while (startingAfter)
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e, 'Failed to list active subscriptions')
        throw new BadGatewayException(
          'Failed to list active subscriptions from Stripe',
          e.message,
        )
      }
      throw e
    }
    return Array.from(emails)
  }

  async retrieveSubscription(subscriptionId: string) {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId)
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(
          e,
          `Failed to retrieve subscription ${subscriptionId}`,
        )
        throw new BadGatewayException(
          `Failed to retrieve subscription ${subscriptionId}`,
          e.message,
        )
      }
      throw e
    }
  }

  async cancelSubscription(subscriptionId: string) {
    try {
      return await this.stripe.subscriptions.cancel(subscriptionId)
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e, `Failed to cancel subscription ${subscriptionId}`)
        await this.slack.errorMessage({
          message: 'Error canceling subscription',
          error: { subscriptionId, error: e },
        })
        throw new BadGatewayException(
          `Failed to cancel subscription ${subscriptionId}`,
          { cause: e },
        )
      }
      throw e
    }
  }
}
