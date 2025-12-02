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

export interface CompletePurchaseDto {
  paymentIntentId: string
}

export type PostPurchaseHandler<Metadata, Result = unknown> = (
  paymentIntentId: string,
  metadata: Metadata,
) => Promise<Result>

export interface PurchaseHandler<Metadata, Result = unknown> {
  validatePurchase(metadata: Metadata): Promise<void | Stripe.PaymentIntent>
  calculateAmount(metadata: Metadata): Promise<number>
  executePostPurchase?(
    paymentIntentId: string,
    metadata: Metadata,
  ): Promise<Result>
}
