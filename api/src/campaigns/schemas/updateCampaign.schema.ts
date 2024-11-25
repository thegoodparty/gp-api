import { z } from 'zod'

// TODO: make schemas for the actual JSON content
export const updateCampaignSchema = z.object({
  data: z.record(z.unknown()).optional(),
  details: z.record(z.unknown()).optional(),
  pathToVictory: z.record(z.unknown()).optional(),
})

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>
