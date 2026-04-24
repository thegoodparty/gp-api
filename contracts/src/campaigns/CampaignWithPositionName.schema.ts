import { z } from 'zod'
import { ReadCampaignOutputSchema } from './ReadCampaignOutput.schema'

/**
 * Campaign list items are enriched with `positionName` (resolved from the
 * campaign's organization) so admin/M2M consumers can render the
 * human-readable position without a per-row roundtrip.
 *
 * `raceTargetMetrics` is intentionally NOT included here — it requires
 * per-campaign external lookups and would be too expensive for list
 * endpoints. Use `CampaignWithLiveContextSchema` for the single-campaign
 * read shape that includes those metrics.
 */
export const CampaignWithPositionNameSchema = ReadCampaignOutputSchema.extend({
  positionName: z.string().nullable(),
})

export type CampaignWithPositionName = z.infer<
  typeof CampaignWithPositionNameSchema
>
