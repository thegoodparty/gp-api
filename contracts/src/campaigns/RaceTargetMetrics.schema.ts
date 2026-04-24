import { z } from 'zod'

/**
 * Live race-target metrics for a single campaign, computed on-demand from the
 * elections service. Returned alongside the full campaign read shape (e.g.
 * `GET /v1/campaigns/:id`).
 */
export const RaceTargetMetricsSchema = z.object({
  winNumber: z.number(),
  voterContactGoal: z.number(),
  projectedTurnout: z.number(),
})

export type RaceTargetMetrics = z.infer<typeof RaceTargetMetricsSchema>
