import { Injectable, Logger } from '@nestjs/common'
import { User } from '@prisma/client'
import { SegmentService } from 'src/segment/segment.service'
import Stripe from 'stripe'
import { EVENTS } from 'src/segment/segment.types'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(private readonly segment: SegmentService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async trackEvent(user: User, eventName: string, properties: any) {
    return this.segment.trackEvent(user.id, eventName, properties)
  }

  track(
    userId: number,
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    properties?: Record<string, unknown>,
  ) {
    this.segment.trackEvent(userId, eventName, properties)
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  identify(userId: number, traits: Record<string, unknown>) {
    this.segment.identify(userId, traits)
  }

  async trackProPayment(userId: number, session: Stripe.Checkout.Session) {
    const subscription = session.subscription as Stripe.Subscription
    const item = subscription.items.data[0]
    const price = item?.price?.unit_amount_decimal
      ? Number(item.price.unit_amount_decimal) / 100
      : 0
    const intent = session.payment_intent as Stripe.PaymentIntent
    const pm = intent.payment_method as Stripe.PaymentMethod

    const paymentMethod =
      pm.type === 'card' ? (pm.card?.wallet?.type ?? 'credit card') : pm.type

    this.segment.trackEvent(userId, EVENTS.Account.ProSubscriptionConfirmed, {
      price,
      paymentMethod,
      renewalDate: new Date(
        subscription.current_period_end * 1000,
      ).toISOString(),
    })
  }
}
