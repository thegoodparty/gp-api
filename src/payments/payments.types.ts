import Stripe from 'stripe'

// export interface StripeCheckoutSessionMetadata extends Stripe.MetadataParam {
//   userId?: number
// }

export type StripeCheckoutSessionCompletedEventWithMetadata =
  Stripe.CheckoutSessionCompletedEvent & {
    data: {
      object: {
        metadata: Stripe.Metadata | null //StripeCheckoutSessionMetadata | null
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
