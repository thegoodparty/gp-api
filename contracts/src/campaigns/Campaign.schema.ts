import { z } from 'zod'
import { CampaignTierSchema } from '../generated/enums'
import type { CampaignAiContent, CampaignData, CampaignDetails } from './types'

export const CampaignSchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  slug: z.string(),
  isActive: z.boolean(),
  isVerified: z.boolean().nullish(),
  isPro: z.boolean().nullish(),
  isDemo: z.boolean(),
  didWin: z.boolean().nullish(),
  dateVerified: z.coerce.date().nullish(),
  tier: CampaignTierSchema.nullish(),
  formattedAddress: z.string().nullish(),
  placeId: z.string().nullish(),
  data: z.record(z.string(), z.unknown()),
  details: z.record(z.string(), z.unknown()),
  aiContent: z.record(z.string(), z.unknown()),
  vendorTsData: z.record(z.string(), z.unknown()),
  userId: z.number(),
  canDownloadFederal: z.boolean(),
  completedTaskIds: z.array(z.string()),
  hasFreeTextsOffer: z.boolean(),
  freeTextsOfferRedeemedAt: z.coerce.date().nullish(),
})

export type ReadCampaignOutput = Omit<
  z.infer<typeof CampaignSchema>,
  'vendorTsData' | 'data' | 'details' | 'aiContent'
> & {
  data: CampaignData
  details: CampaignDetails
  aiContent: CampaignAiContent
}
