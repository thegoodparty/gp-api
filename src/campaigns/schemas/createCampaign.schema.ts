import { z } from 'zod'

export const createCampaignSchema = z.object({ slug: z.string() })

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>
