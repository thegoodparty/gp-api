export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  PRO_SUBSCRIPTION = 'PRO_SUBSCRIPTION',
  ADDITIONAL_FEATURES = 'ADDITIONAL_FEATURES',
  OUTREACH = 'OUTREACH',
}

export interface PurchaseMetadata {
  domainName?: string
  websiteId?: number
  planType?: string
  duration?: string
  features?: string[]
  campaignId?: number
  outreachType?: string
  audienceSize?: number
  audienceRequest?: string
  script?: string
  message?: string
  date?: string
}

export interface CreatePurchaseIntentDto {
  type: PurchaseType
  metadata: PurchaseMetadata
}

export interface CompletePurchaseDto {
  paymentIntentId: string
}

export type PostPurchaseHandler = (
  paymentIntentId: string,
  metadata: PurchaseMetadata,
) => Promise<any>

export interface PurchaseHandler {
  validatePurchase(metadata: PurchaseMetadata): Promise<void>
  calculateAmount(metadata: PurchaseMetadata): Promise<number>
  executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata,
  ): Promise<any>
}
