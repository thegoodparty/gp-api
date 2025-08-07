import { BasePurchaseMetadata } from '../payments/purchase.types'

export interface DomainPurchaseMetadata extends BasePurchaseMetadata {
  domainName: string
  websiteId: number
}
