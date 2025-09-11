import { SegmentService } from 'src/vendors/segment/segment.service'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import Stripe from 'stripe'
import {
  EVENTS,
  SegmentIdentityTraits,
  SegmentTrackEventProperties,
} from 'src/vendors/segment/segment.types'
import { UsersService } from '../users/services/users.service'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    private readonly segment: SegmentService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  async track(
    userId: number,
    eventName: string,
    properties?: SegmentTrackEventProperties,
  ) {
    let email: string | undefined
    try {
      const user = await this.usersService.findFirst({ where: { id: userId } })
      email = user?.email
    } catch (e) {
      this.logger.error('Error fetching user for analytics', e)
    }
    this.segment.trackEvent(userId, eventName, {
      ...(email ? { email } : {}),
      ...properties,
    })
  }

  identify(userId: number, traits: SegmentIdentityTraits) {
    this.segment.identify(userId, traits)
  }

  async trackProPayment(userId: number, session: Stripe.Checkout.Session) {
    try {
      const subscription = session.subscription as Stripe.Subscription
      const item = subscription?.items?.data[0]
      const price = item?.price?.unit_amount_decimal
        ? Number(item.price.unit_amount_decimal) / 100
        : 0
      const intent = session.payment_intent as Stripe.PaymentIntent
      const pm = intent.payment_method as Stripe.PaymentMethod

      const paymentMethod =
        pm.type === 'card' ? (pm.card?.wallet?.type ?? 'credit card') : pm.type

      this.track(userId, EVENTS.Account.ProSubscriptionConfirmed, {
        price,
        paymentMethod,
        renewalDate: new Date(
          subscription.current_period_end * 1000,
        ).toISOString(),
      })
    } catch (e) {
      this.logger.error('Error tracking pro payment', e)
    }
  }
}
