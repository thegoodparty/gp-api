import { Injectable, Logger } from '@nestjs/common'
import { SegmentService } from 'src/segment/segment.service'
import Stripe from 'stripe'
import {
  EVENTS,
  SegmentTrackEventProperties,
  SegmentIdentityTraits,
} from 'src/segment/segment.types'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(private readonly segment: SegmentService) {}

  track(
    userId: number,
    eventName: string,
    properties?: SegmentTrackEventProperties,
  ) {
    this.segment.trackEvent(userId, eventName, properties)
  }

  identify(userId: number, traits: SegmentIdentityTraits) {
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
