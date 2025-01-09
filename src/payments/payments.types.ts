import Stripe from 'stripe'

export interface StripeCheckoutSessionMetadata extends Stripe.MetadataParam {
  userId: number
}

export type StripeCheckoutSessionCompletedEventWithMetadata =
  Stripe.CheckoutSessionCompletedEvent & {
    data: {
      object: {
        metadata: StripeCheckoutSessionMetadata
      }
    }
  }

export enum WebhookEventType {
  CheckoutSessionCompleted = 'checkout.session.completed',
  CheckoutSessionExpired = 'checkout.session.expired',
  CustomerSubscriptionDeleted = 'customer.subscription.deleted',
  CustomerSubscriptionUpdated = 'customer.subscription.updated',
  CustomerSubscriptionResumed = 'customer.subscription.resumed',
}
