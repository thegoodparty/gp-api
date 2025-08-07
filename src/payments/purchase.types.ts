export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  OUTREACH = 'OUTREACH',
}

export interface BasePurchaseMetadata {
  campaignId?: number
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
  executePostPurchase?(
    paymentIntentId: string,
    metadata: PurchaseMetadata<T>,
  ): Promise<any>
}
