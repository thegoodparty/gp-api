import { z } from 'zod'

// TODO: make schemas for the actual JSON content
export const updateCampaignSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  pathToVictory: z.record(z.string(), z.unknown()).optional(),
})

export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>
