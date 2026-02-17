import { createZodDto } from 'nestjs-zod'
import { CampaignSchema } from './Campaign.schema'

const updateCampaignM2MSchema = CampaignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  vendorTsData: true,
}).partial()

export class UpdateCampaignM2MSchema extends createZodDto(
  updateCampaignM2MSchema,
) {}
