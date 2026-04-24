import { z } from 'zod'
import { CampaignWithPositionNameSchema } from './CampaignWithPositionName.schema'
import { RaceTargetMetricsSchema } from './RaceTargetMetrics.schema'

/**
 * The full single-campaign read shape (e.g. `GET /v1/campaigns/:id` over
 * M2M), enriched with both `positionName` and live race-target metrics.
 *
 * For list endpoints, prefer `CampaignWithPositionNameSchema` to avoid the
 * expensive per-row metrics lookup.
 */
export const CampaignWithLiveContextSchema =
  CampaignWithPositionNameSchema.extend({
    raceTargetMetrics: RaceTargetMetricsSchema.nullable(),
  })

export type CampaignWithLiveContext = z.infer<
  typeof CampaignWithLiveContextSchema
>
