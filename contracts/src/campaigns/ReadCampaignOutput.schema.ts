import { CampaignSchema } from './Campaign.schema'

export { type ReadCampaignOutput } from './Campaign.schema'

export const ReadCampaignOutputSchema = CampaignSchema.omit({
  vendorTsData: true,
})
