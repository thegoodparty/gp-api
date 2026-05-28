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
  /**
   * Estimated filing fee for the race, in dollars, sourced from BallotReady
   * `filing_requirements` via election-api. `null` when the fee can't be
   * extracted unambiguously (multiple dollar amounts, missing data, or no
   * regex match). See `filingRequirementsText` for the raw source string.
   */
  filingFee: z.number().nullable(),
  /**
   * Raw `filing_requirements` text from BallotReady. Always passed through so
   * the UI can show "filing fees are estimated — click for full text" even
   * when `filingFee` is null. `null` when BallotReady has no data.
   */
  filingRequirementsText: z.string().nullable(),
})

export type RaceTargetMetrics = z.infer<typeof RaceTargetMetricsSchema>
