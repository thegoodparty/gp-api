import type { OutreachPurchaseMetadata } from '../outreach/types/outreach.types'
import type { DomainPurchaseMetadata } from '../websites/domains.types'
import Stripe from 'stripe'
export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  TEXT = 'TEXT',
  POLL = 'POLL',
}

export interface BasePurchaseMetadata {
  campaignId?: number
}

export interface CreateCheckoutSessionDto<Metadata> {
  type: PurchaseType
  metadata: Metadata
  returnUrl?: string
}

export interface CompleteCheckoutSessionDto {
  checkoutSessionId: string
}

export type FreePurchaseMetadata =
  | OutreachPurchaseMetadata
  | DomainPurchaseMetadata
  | BasePurchaseMetadata

export interface CompleteFreePurchaseDto {
  purchaseType: PurchaseType
  metadata: FreePurchaseMetadata
}

export type CheckoutSessionPostPurchaseHandler<Metadata> = (
  sessionId: string,
  metadata: Metadata,
) => Promise<unknown>

export interface PurchaseHandler<Metadata> {
  validatePurchase(metadata: Metadata): Promise<void | Stripe.PaymentIntent>
  calculateAmount(metadata: Metadata): Promise<number>
  getProductName?(metadata: Metadata): string
  getProductDescription?(metadata: Metadata): string | undefined
}
