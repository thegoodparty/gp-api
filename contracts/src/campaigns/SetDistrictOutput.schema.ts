import { z } from 'zod'
import { ReadCampaignOutputSchema } from './ReadCampaignOutput.schema'

/**
 * TODO: The PathToVictory sub-schema here duplicates the shape defined in
 * gp-sdk/src/types/pathToVictory.ts. Long-term, P2V schemas should live in
 * contracts as the single source of truth, with the SDK deriving its types
 * from here. Track this consolidation separately.
 */
const PathToVictorySchema = z.object({
  id: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  campaignId: z.number(),
  data: z.record(z.string(), z.unknown()),
})

export const SetDistrictOutputSchema = ReadCampaignOutputSchema.extend({
  pathToVictory: PathToVictorySchema.nullish(),
})

export type SetDistrictOutput = z.infer<typeof SetDistrictOutputSchema>
