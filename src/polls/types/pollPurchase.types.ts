import { BasePurchaseMetadata } from 'src/payments/purchase.types'

export interface PollPurchaseMetadata extends BasePurchaseMetadata {
  pollId: number
  count: number
}
