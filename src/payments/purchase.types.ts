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

export interface CreateCheckoutSessionDto<Metadata> {
  type: PurchaseType
  metadata: Metadata
  returnUrl?: string
}

export interface CompletePurchaseDto {
  paymentIntentId: string
}

export interface CompleteCheckoutSessionDto {
  checkoutSessionId: string
}

export type CompleteFreePurchaseMetadata = BasePurchaseMetadata

export interface CompleteFreePurchaseDto<
  Metadata extends CompleteFreePurchaseMetadata = CompleteFreePurchaseMetadata,
> {
  purchaseType: PurchaseType
  metadata: Metadata
}

export type PostPurchaseHandler<Metadata> = (
  paymentIntentId: string,
  metadata: Metadata,
) => Promise<unknown>

export type CheckoutSessionPostPurchaseHandler<Metadata> = (
  sessionId: string,
  metadata: Metadata,
) => Promise<unknown>

export interface PurchaseHandler<Metadata> {
  validatePurchase(metadata: Metadata): Promise<void | Stripe.PaymentIntent>
  calculateAmount(metadata: Metadata): Promise<number>
  getProductName?(metadata: Metadata): string
  getProductDescription?(metadata: Metadata): string | undefined
  executePostPurchase?(
    paymentIntentId: string,
    metadata: Metadata,
  ): Promise<unknown>
}
