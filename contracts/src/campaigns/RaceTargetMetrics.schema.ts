import { z } from 'zod'

/**
 * Candidate row from election-api's campaign-strategy-context endpoint.
 * Mirrors `CampaignStrategyContextCandidate` on election-api so the shapes
 * stay aligned across services.
 */
export const RaceCandidateSchema = z.object({
  gpCandidateId: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  party: z.string().nullable(),
  isIncumbent: z.boolean().nullable(),
})

/**
 * Live race-target metrics for a single campaign, computed on-demand from the
 * elections service. Returned alongside the full campaign read shape (e.g.
 * `GET /v1/campaigns/:id`).
 *
 * Sourced from election-api's `/campaign-strategy-context` endpoint via the
 * BR race hash on `campaign.details.raceId`. `winNumber` prefers BR's
 * calibrated `civics_win_number` when available; falls back to the simple
 * majority threshold (`floor(projectedTurnout / 2) + 1`). `filingFee` /
 * `filingRequirementsText` come from a separate `/races/by-br-hash-id`
 * lookup because the context endpoint doesn't surface them.
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
  // The fields below come straight from election-api's
  // /campaign-strategy-context endpoint. All nullable — null when the race
  // hash didn't resolve to a Position+District or the upstream data is
  // sparse.
  registeredVoters: z.number().nullable(),
  uniqueCellphones: z.number().nullable(),
  uniqueLandlines: z.number().nullable(),
  /**
   * General-election turnout for the race's calendar year, regardless of
   * whether the looked-up race is a primary, general, or runoff. Single
   * baseline for the campaign-plan template.
   */
  projectedVoterTurnout: z.number().nullable(),
  candidates: z.array(RaceCandidateSchema),
  generalElectionDate: z.string().nullable(),
  primaryElectionDate: z.string().nullable(),
  relevantElectionDate: z.string().nullable(),
  officialOfficeName: z.string().nullable(),
  officeLevel: z.string().nullable(),
  officeType: z.string().nullable(),
  numberOfSeats: z.number().nullable(),
})

export type RaceCandidate = z.infer<typeof RaceCandidateSchema>
export type RaceTargetMetrics = z.infer<typeof RaceTargetMetricsSchema>
