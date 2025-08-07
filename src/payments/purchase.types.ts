export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  PRO_SUBSCRIPTION = 'PRO_SUBSCRIPTION',
  ADDITIONAL_FEATURES = 'ADDITIONAL_FEATURES',
  OUTREACH = 'OUTREACH',
}

export interface BasePurchaseMetadata {
  campaignId?: number
}

export interface DomainPurchaseMetadata extends BasePurchaseMetadata {
  domainName: string
  websiteId: number
}

export interface OutreachPurchaseMetadata extends BasePurchaseMetadata {
  contactCount: number
  pricePerContact: number
  outreachType: string
  audienceSize: number
  audienceRequest?: string
  script?: string
  message?: string
  date?: string
}

export interface SubscriptionPurchaseMetadata extends BasePurchaseMetadata {
  planType: string
  duration: string
  features?: string[]
}

export interface FeaturesPurchaseMetadata extends BasePurchaseMetadata {
  features: string[]
  websiteId?: number
}

export type PurchaseMetadata<T = BasePurchaseMetadata> = T

export interface CreatePurchaseIntentDto {
  type: PurchaseType
  metadata: PurchaseMetadata<any>
}

export interface CompletePurchaseDto {
  paymentIntentId: string
}

export type PostPurchaseHandler = (
  paymentIntentId: string,
  metadata: PurchaseMetadata<any>,
) => Promise<any>

export interface PurchaseHandler<T = BasePurchaseMetadata> {
  validatePurchase(metadata: PurchaseMetadata<T>): Promise<void>
  calculateAmount(metadata: PurchaseMetadata<T>): Promise<number>
  executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata<T>,
  ): Promise<any>
}
