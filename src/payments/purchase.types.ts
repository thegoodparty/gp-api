import Stripe from 'stripe'
export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  TEXT = 'TEXT',
  POLL = 'POLL',
}

export interface BasePurchaseMetadata {
  campaignId?: number
}

export interface CreatePurchaseIntentDto<Metadata> {
  type: PurchaseType
  metadata: Metadata
}

/**
 * DTO for creating a Custom Checkout Session with promo code support.
 * Uses the same structure as CreatePurchaseIntentDto for consistency.
 */
export interface CreateCheckoutSessionDto<Metadata> {
  type: PurchaseType
  metadata: Metadata
  /**
   * URL to redirect to after successful payment.
   * Must include `{CHECKOUT_SESSION_ID}` placeholder for session ID.
   */
  returnUrl?: string
}

export interface CompletePurchaseDto {
  paymentIntentId: string
}

/**
 * DTO for completing a purchase made via Checkout Session.
 */
export interface CompleteCheckoutSessionDto {
  checkoutSessionId: string
}

export type PostPurchaseHandler<Metadata> = (
  paymentIntentId: string,
  metadata: Metadata,
) => Promise<unknown>

/**
 * Handler for post-purchase processing of Checkout Sessions.
 * The sessionId is the Checkout Session ID, and metadata comes from the session.
 */
export type CheckoutSessionPostPurchaseHandler<Metadata> = (
  sessionId: string,
  metadata: Metadata,
) => Promise<unknown>

export interface PurchaseHandler<Metadata> {
  validatePurchase(metadata: Metadata): Promise<void | Stripe.PaymentIntent>
  calculateAmount(metadata: Metadata): Promise<number>
  /**
   * Returns the product name to display in checkout
   */
  getProductName?(metadata: Metadata): string
  /**
   * Returns optional product description for checkout
   */
  getProductDescription?(metadata: Metadata): string | undefined
  executePostPurchase?(
    paymentIntentId: string,
    metadata: Metadata,
  ): Promise<unknown>
}
