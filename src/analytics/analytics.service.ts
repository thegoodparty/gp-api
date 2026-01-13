import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { SegmentService } from 'src/vendors/segment/segment.service'
import {
  EVENTS,
  SegmentIdentityTraits,
  SegmentTrackEventProperties,
  UserContext,
} from 'src/vendors/segment/segment.types'
import Stripe from 'stripe'
import { UsersService } from '../users/services/users.service'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    private readonly segment: SegmentService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  private async getUserContext(
    userId: number,
  ): Promise<UserContext | undefined> {
    try {
      const user = await this.usersService.findFirst({ where: { id: userId } })
      if (!user) {
        this.logger.warn(`[ANALYTICS] User not found: ${userId}`)
        return undefined
      }

      const metaData = user.metaData as PrismaJson.UserMetaData | null
      const hubspotId = metaData?.hubspotId as string | undefined
      const userContext: UserContext = {
        email: user.email,
        hubspotId,
      }

      this.logger.debug(
        `[ANALYTICS] User context retrieved for user ${userId}: email=${!!userContext.email}, hubspotId=${!!userContext.hubspotId}`,
      )
      return userContext
    } catch (e) {
      this.logger.error(
        `[ANALYTICS] Error fetching user context for analytics - User: ${userId}`,
        e,
      )
      return undefined
    }
  }

  async track(
    userId: number,
    eventName: string,
    properties?: SegmentTrackEventProperties,
  ) {
    this.logger.debug(
      `[ANALYTICS] Starting event tracking - Event: ${eventName}, User: ${userId}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const userContext = await this.getUserContext(userId)

    const eventData = {
      ...(userContext?.email ? { email: userContext.email as string } : {}),
      ...properties,
    }

    try {
      const result = await this.segment.trackEvent(
        userId,
        eventName,
        eventData,
        userContext,
      )

      return result
    } catch (e) {
      this.logger.error(
        `[ANALYTICS] Failed to track event: ${eventName} for user: ${userId}`,
        e,
      )
      throw e
    }
  }

  async identify(userId: number, traits: SegmentIdentityTraits) {
    this.logger.debug(
      `[ANALYTICS] Starting user identification - User: ${userId}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const userContext = await this.getUserContext(userId)

    try {
      await this.segment.identify(userId, traits, userContext)
      this.logger.debug(`[ANALYTICS] Successfully identified user ${userId}`)
    } catch (e) {
      this.logger.error(`[ANALYTICS] Failed to identify user: ${userId}`, e)
      throw e
    }
  }

  async trackProPayment(userId: number, session: Stripe.Checkout.Session) {
    this.logger.debug(
      `[ANALYTICS] Starting pro payment tracking - User: ${userId}, Session: ${session.id}`,
    )

    try {
      // Validate session has required data
      if (!session.subscription) {
        this.logger.warn(
          `[ANALYTICS] No subscription found in session ${session.id} for user ${userId}`,
        )
        return
      }

      if (!session.payment_intent) {
        this.logger.warn(
          `[ANALYTICS] No payment_intent found in session ${session.id} for user ${userId}`,
        )
        return
      }

      // Handle subscription data - could be string ID or full object
      let subscription: Stripe.Subscription
      if (typeof session.subscription === 'string') {
        this.logger.warn(
          `[ANALYTICS] Subscription is string ID in session ${session.id}, cannot extract detailed data for user ${userId}. Tracking with limited data.`,
        )
        await this.track(userId, EVENTS.Account.ProSubscriptionConfirmed, {
          price: 0,
          paymentMethod: null, // Backward compatible field
          paymentMethodType: null, // New structured field
          walletType: null, // New structured field
          renewalDate: new Date().toISOString(),
        })
        this.logger.debug(
          `[ANALYTICS] Successfully tracked pro payment with limited data - User: ${userId}`,
        )
        return
      } else {
        subscription = session.subscription
        this.logger.debug(
          `[ANALYTICS] Subscription object found for user ${userId}`,
        )
      }

      // Handle payment intent data - could be string ID or full object
      let paymentIntent: Stripe.PaymentIntent | null = null
      if (typeof session.payment_intent === 'string') {
        this.logger.warn(
          `[ANALYTICS] Payment intent is string ID in session ${session.id}, cannot extract payment method for user ${userId}`,
        )
        paymentIntent = null
      } else {
        paymentIntent = session.payment_intent
        this.logger.debug(
          `[ANALYTICS] Payment intent object found for user ${userId}`,
        )
      }

      // Extract price data safely
      const item = subscription?.items?.data?.[0]
      const price = item?.price?.unit_amount_decimal
        ? Number(item.price.unit_amount_decimal) / 100
        : 0
      this.logger.debug(
        `[ANALYTICS] Extracted price: $${price} for user ${userId}`,
      )

      // Extract payment method safely
      let paymentMethodType: Stripe.PaymentMethod.Type | null = null
      let walletType: Stripe.PaymentMethod.Card.Wallet.Type | null = null
      if (paymentIntent?.payment_method) {
        const pm = paymentIntent.payment_method as Stripe.PaymentMethod
        paymentMethodType = pm.type

        // Extract wallet type for card payments
        if (pm.type === 'card' && pm.card?.wallet?.type) {
          walletType = pm.card.wallet.type
        }

        this.logger.debug(
          `[ANALYTICS] Extracted payment method type: ${paymentMethodType}, wallet type: ${walletType} for user ${userId}`,
        )
      } else {
        this.logger.warn(
          `[ANALYTICS] No payment method found for user ${userId}`,
        )
      }

      // Extract renewal date safely
      let renewalDate: string
      if (subscription.current_period_end) {
        renewalDate = new Date(
          subscription.current_period_end * 1000,
        ).toISOString()
        this.logger.debug(
          `[ANALYTICS] Extracted renewal date: ${renewalDate} for user ${userId}`,
        )
      } else {
        this.logger.warn(
          `[ANALYTICS] No current_period_end found in subscription for user ${userId}`,
        )
        renewalDate = new Date().toISOString()
      }

      // Maintain backward compatibility: combine payment method and wallet type
      let paymentMethod: string | null = null
      if (paymentMethodType) {
        if (paymentMethodType === 'card' && walletType) {
          // For card payments with wallet, use wallet type (e.g., 'apple_pay')
          paymentMethod = walletType
        } else {
          // For other payment methods, use the payment method type
          paymentMethod = paymentMethodType
        }
      }

      const eventProperties = {
        price,
        paymentMethod, // Backward compatible combined field
        paymentMethodType, // New structured field
        walletType, // New structured field
        renewalDate,
      }
      this.logger.debug(
        `[ANALYTICS] Tracking pro payment with properties: ${JSON.stringify(eventProperties)} for user ${userId}`,
      )

      await this.track(
        userId,
        EVENTS.Account.ProSubscriptionConfirmed,
        eventProperties,
      )
      this.logger.debug(
        `[ANALYTICS] Successfully tracked pro payment for user ${userId}`,
      )
    } catch (e) {
      this.logger.error(
        `[ANALYTICS] Error tracking pro payment for user ${userId}, session ${session.id}`,
        e,
      )
      throw e // Re-throw to propagate the error
    }
  }
}
