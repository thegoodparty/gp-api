import { BasePurchaseMetadata } from 'src/payments/purchase.types'

export interface PollPurchaseMetadata extends BasePurchaseMetadata {
  pollId: string
  count: string
}
