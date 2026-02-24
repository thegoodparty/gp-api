import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  BallotReadyPositionLevelSchema,
  CampaignSchema,
  ElectionLevelSchema,
} from '@goodparty_org/contracts'

// TODO(ENG-6410): This schema uses .passthrough() which allows ANY fields to be sent through,
// even if not defined here. This is a security/data integrity concern because:
// 1. Subscription fields (subscriptionId, subscriptionCancelAt, etc.) can be directly
//    modified via this API, potentially causing desync with Stripe.
// 2. These fields should ONLY be modified by Stripe webhook handlers.
// 3. To fix: Add .transform() to strip subscription fields, or remove .passthrough()
//    and explicitly define all allowed fields.
// See: ENG-4918, ENG-6495 for related subscription sync bugs.

const CampaignDetailsSchema = z
  .object({
    state: z.string(),
    ballotLevel: BallotReadyPositionLevelSchema,
    electionDate: z.string(),
    primaryElectionDate: z.string(),
    zip: z.string(),
    knowRun: z.enum(['yes']),
    runForOffice: z.enum(['yes', 'no']),
    pledged: z.boolean(),
    isProUpdatedAt: z.number(),
    customIssues: z.array(
      z.object({
        title: z.string(),
        position: z.string(),
      }),
    ),
    runningAgainst: z.array(
      z.object({
        name: z.string(),
        party: z.string(),
        description: z.string(),
      }),
    ),
    geoLocation: z.object({
      geoHash: z.string(),
      lng: z.number(),
      lat: z.number(),
    }),
    geoLocationFailed: z.boolean(),
    city: z.string(),
    county: z.string(),
    normalizedOffice: z.string(),
    otherOffice: z.string(),
    office: z.string(),
    party: z.string(),
    otherParty: z.string(),
    district: z.string(),
    raceId: z.string(),
    level: ElectionLevelSchema,
    noNormalizedOffice: z.boolean(),
    website: z.string(),
    pastExperience: z.union([z.string(), z.record(z.string(), z.string())]),
    occupation: z.string(),
    funFact: z.string(),
    campaignCommittee: z.string(),
    statementName: z.string(),
    // TODO(ENG-6410): These subscription fields should be BLOCKED from direct updates, not just validated.
    // They should only be modified via Stripe webhook handlers (paymentEventsService.ts).
    subscriptionId: z.string().nullish(),
    endOfElectionSubscriptionCanceled: z.boolean(),
    subscriptionCanceledAt: z.number(),
    subscriptionCancelAt: z.number(),
    filingPeriodsStart: z.string().nullish(),
    filingPeriodsEnd: z.string().nullish(),
    officeTermLength: z.string(),
    partisanType: z.string().nullish().optional(),
    priorElectionDates: z.array(z.string()),
    positionId: z.string().nullish(),
    electionId: z.string().nullish(),
    tier: z.string(),
  })
  .partial()
  .passthrough()

// TODO: make schemas data, pathToVictory, aiContent
export class UpdateCampaignSchema extends createZodDto(
  CampaignSchema.pick({
    slug: true,
    data: true,
    aiContent: true,
    formattedAddress: true,
    placeId: true,
    canDownloadFederal: true,
  })
    .partial()
    .extend({
      details: CampaignDetailsSchema.optional(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      pathToVictory: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
) {}

export class SetDistrictDTO extends createZodDto(
  z.object({
    slug: z.string().optional(),
    L2DistrictType: z.string(),
    L2DistrictName: z.string(),
  }),
) {}
