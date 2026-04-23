import { z } from 'zod'
import { ReadCampaignOutputSchema } from '@goodparty_org/contracts'

/**
 * Campaign list items are enriched with `positionName` (resolved from the
 * campaign's organization) so the admin UI can show the human-readable
 * position without a per-row roundtrip. We intentionally do NOT include
 * `raceTargetMetrics` here — that requires per-campaign external lookups
 * and would be too expensive for list endpoints.
 */
export const CampaignWithPositionNameSchema = ReadCampaignOutputSchema.extend({
  positionName: z.string().nullable(),
})

export type CampaignWithPositionName = z.infer<
  typeof CampaignWithPositionNameSchema
>
