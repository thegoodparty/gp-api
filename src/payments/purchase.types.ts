export enum PurchaseType {
  DOMAIN_REGISTRATION = 'DOMAIN_REGISTRATION',
  TEXT = 'TEXT',
  POLL = 'POLL',
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  TResult = unknown,
> = (
  paymentIntentId: string,
  metadata: PurchaseMetadata<TMetadata>,
) => Promise<TResult>

export interface PurchaseHandler<
  TMetadata extends BasePurchaseMetadata = BasePurchaseMetadata,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  TResult = unknown,
> {
  validatePurchase(metadata: PurchaseMetadata<TMetadata>): Promise<void>
  calculateAmount(metadata: PurchaseMetadata<TMetadata>): Promise<number>
  executePostPurchase?(
    paymentIntentId: string,
    metadata: PurchaseMetadata<TMetadata>,
  ): Promise<TResult>
}
