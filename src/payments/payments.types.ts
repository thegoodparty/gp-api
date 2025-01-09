import Stripe from 'stripe'

export type StripeEventWithMetaData = Stripe.Event & {
  data: {
    object: {
      metadata: Stripe.Metadata | null
    }
  }
}

export type StripeCheckoutSessionCompletedEventWithMetadata =
  Stripe.CheckoutSessionCompletedEvent & StripeEventWithMetaData

export type StripeCheckoutSessionExpiredEventWithMetadata =
  Stripe.CheckoutSessionExpiredEvent & StripeEventWithMetaData

export enum WebhookEventType {
  CheckoutSessionCompleted = 'checkout.session.completed',
  CheckoutSessionExpired = 'checkout.session.expired',
  CustomerSubscriptionDeleted = 'customer.subscription.deleted',
  CustomerSubscriptionUpdated = 'customer.subscription.updated',
  CustomerSubscriptionResumed = 'customer.subscription.resumed',
}
