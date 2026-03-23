import { z } from 'zod'
import { CampaignSchema } from './Campaign.schema'

export const UpdateCampaignM2MSchema = CampaignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  vendorTsData: true,
}).partial()

export type UpdateCampaignM2MInput = z.infer<typeof UpdateCampaignM2MSchema>
