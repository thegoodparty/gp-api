import { z } from 'zod'
import { PathToVictoryDataSchema } from './PathToVictoryData.schema'

export const PathToVictorySchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  campaignId: z.number(),
  data: PathToVictoryDataSchema.strip(),
})
