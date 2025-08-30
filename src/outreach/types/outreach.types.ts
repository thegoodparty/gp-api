import { Prisma } from '@prisma/client'
import { BasePurchaseMetadata } from '../../payments/purchase.types'

export type OutreachWithVoterFileFilter = Prisma.OutreachGetPayload<{
  include: { voterFileFilter: true }
}>
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

export interface TextOutreachPostPurchaseResult {
  campaignId: number
  contactCount: number
  outreachType: string
  newTextCount: number
}
