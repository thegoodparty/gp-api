import { Campaign as PrismaCampaign } from '@prisma/client'

type NestedRecords = Record<
  string,
  string | Record<string, string | Record<string, string>>
>

export type CampaignAiContent = NestedRecords
export type CampaignDataContent = NestedRecords & {
  createdBy?: 'admin' | string
}
export type CampaignDetailsContent = NestedRecords

export type Campaign = PrismaCampaign & {
  aiContent?: CampaignAiContent
  data?: CampaignDataContent
  details?: CampaignDetailsContent
}
