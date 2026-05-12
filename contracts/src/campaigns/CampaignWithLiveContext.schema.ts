import { z } from 'zod'
import { CampaignWithPositionNameSchema } from './CampaignWithPositionName.schema'
import { OrganizationSchema } from './Organization.schema'
import { RaceTargetMetricsSchema } from './RaceTargetMetrics.schema'

/**
 * The full single-campaign read shape (e.g. `GET /v1/campaigns/:id` over
 * M2M), enriched with both `positionName` and live race-target metrics.
 *
 * `organization` is optional because some endpoints (e.g. `GET /v1/campaigns/:id`)
 * strip it from the response while others (e.g. `GET /v1/campaigns/mine`)
 * include it for downstream consumers that need `organization.positionId`.
 *
 * For list endpoints, prefer `CampaignWithPositionNameSchema` to avoid the
 * expensive per-row metrics lookup.
 */
export const CampaignWithLiveContextSchema =
  CampaignWithPositionNameSchema.extend({
    raceTargetMetrics: RaceTargetMetricsSchema.nullable(),
    organization: OrganizationSchema.optional(),
  })

export type CampaignWithLiveContext = z.infer<
  typeof CampaignWithLiveContextSchema
>
