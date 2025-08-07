export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  TEXT = 'TEXT',
}

export interface BasePurchaseMetadata {
  campaignId?: number
}

export type PurchaseMetadata<
  T extends BasePurchaseMetadata = BasePurchaseMetadata,
> = T

export interface CreatePurchaseIntentDto<
  T extends BasePurchaseMetadata = BasePurchaseMetadata,
> {
  type: PurchaseType
  metadata: PurchaseMetadata<T>
}

export interface CompletePurchaseDto {
  paymentIntentId: string
}

export type PostPurchaseHandler<
  TMetadata extends BasePurchaseMetadata = BasePurchaseMetadata,
  TResult = unknown,
> = (
  paymentIntentId: string,
  metadata: PurchaseMetadata<TMetadata>,
) => Promise<TResult>

export interface PurchaseHandler<
  TMetadata extends BasePurchaseMetadata = BasePurchaseMetadata,
  TResult = unknown,
> {
  validatePurchase(metadata: PurchaseMetadata<TMetadata>): Promise<void>
  calculateAmount(metadata: PurchaseMetadata<TMetadata>): Promise<number>
  executePostPurchase?(
    paymentIntentId: string,
    metadata: PurchaseMetadata<TMetadata>,
  ): Promise<TResult>
}
