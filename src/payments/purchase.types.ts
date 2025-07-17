export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  PRO_SUBSCRIPTION = 'PRO_SUBSCRIPTION',
  ADDITIONAL_FEATURES = 'ADDITIONAL_FEATURES',
}

export interface PurchaseMetadata {
  domainName?: string
  websiteId?: number
  planType?: string
  duration?: string
  features?: string[]
}

export interface CreatePurchaseIntentDto {
  type: PurchaseType
  metadata: PurchaseMetadata
}

export interface CompletePurchaseDto {
  paymentIntentId: string
}

export interface PurchaseHandler {
  validatePurchase(metadata: PurchaseMetadata): Promise<void>
  calculateAmount(metadata: PurchaseMetadata): Promise<number>
  executePostPurchase(
    paymentIntentId: string,
    metadata: PurchaseMetadata,
  ): Promise<any>
}
