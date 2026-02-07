import { PurchaseType } from '@/payments/purchase.types'
export enum WebhookEventType {
  CheckoutSessionCompleted = 'checkout.session.completed',
  CheckoutSessionExpired = 'checkout.session.expired',
  CustomerSubscriptionCreated = 'customer.subscription.created',
  CustomerSubscriptionDeleted = 'customer.subscription.deleted',
  CustomerSubscriptionUpdated = 'customer.subscription.updated',
  CustomerSubscriptionResumed = 'customer.subscription.resumed',
}

/**
 * Checkout Session modes for different payment types
 */
export enum CheckoutSessionMode {
  PAYMENT = 'payment', // One-time payments
  SUBSCRIPTION = 'subscription', // Recurring subscriptions
}

export enum PaymentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  REQUIRES_ACTION = 'requires_action',
  PROCESSING = 'processing',
  REQUIRES_CAPTURE = 'requires_capture',
  CANCELED = 'canceled',
  SUCCEEDED = 'succeeded',
}

export enum PaymentType {
  DOMAIN_REGISTRATION = 'domain_registration',
  OUTREACH_PURCHASE = 'outreach_purchase',
  POLL = 'poll',
}

/**
 * Payload for creating a Custom Checkout Session with `ui_mode: 'custom'`.
 * Used for one-time payments with embedded payment forms and promo code support.
 *
 * Migration reference: https://docs.stripe.com/payments/payment-element/migration-ewcs
 */
export interface CustomCheckoutSessionPayload {
  type: PaymentType
  purchaseType: PurchaseType
  /**
   * The amount to charge in cents
   */
  amount: number
  /**
   * Product name displayed in checkout
   */
  productName: string
  /**
   * Optional product description
   */
  productDescription?: string
  /**
   * Whether to allow promo codes (enables Stripe's promo code input)
   */
  allowPromoCodes?: boolean
  /**
   * URL to redirect to after successful payment
   */
  returnUrl: string
  /**
   * Additional metadata to attach to the checkout session
   */
  metadata?: Record<string, string | number | undefined>
}

export type PaymentIntentPayload<T extends PaymentType> = {
  type: T
  /**
   * The amount to charge the user in cents
   */
  amount: number
  description?: string
  purchaseType: PurchaseType
} & (T extends PaymentType.DOMAIN_REGISTRATION
  ? {
      domainName: string
      domainId?: number
    }
  : T extends PaymentType.POLL
    ? {
        count: number
        pollId: number
      }
    : never)

export type PurchaseIntentPayloadEntry = PurchaseType | string | number
