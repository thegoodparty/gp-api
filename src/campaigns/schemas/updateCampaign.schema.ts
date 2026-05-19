import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  BallotReadyPositionLevelSchema,
  CampaignSchema,
  ElectionLevelSchema,
} from '@goodparty_org/contracts'

const STRIPE_MANAGED_DETAIL_KEYS = [
  'subscriptionId',
  'subscriptionCanceledAt',
  'subscriptionCancelAt',
  'endOfElectionSubscriptionCanceled',
  'isProUpdatedAt',
  'proUpgradeSlackNotifiedAt',
]

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
    party: z.string(),
    otherParty: z.string(),
    district: z.string(),
    raceId: z.string().nullish(),
    level: ElectionLevelSchema,
    noNormalizedOffice: z.boolean(),
    website: z.string(),
    pastExperience: z.union([z.string(), z.record(z.string(), z.string())]),
    occupation: z.string(),
    funFact: z.string(),
    campaignCommittee: z.string(),
    statementName: z.string(),
    filingPeriodsStart: z.string().nullish(),
    filingPeriodsEnd: z.string().nullish(),
    officeTermLength: z.string(),
    partisanType: z.string().nullish().optional(),
    priorElectionDates: z.array(z.string()),
    electionId: z.string().nullish(),
    tier: z.string(),
  })
  .partial()
  .passthrough()
  .transform((details) => {
    const safe = { ...details }
    for (const key of STRIPE_MANAGED_DETAIL_KEYS) {
      delete safe[key]
    }
    return safe
  })

export const updateCampaignBodySchema = CampaignSchema.pick({
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
  })
  .strict()

export type UpdateCampaignBody = z.infer<typeof updateCampaignBodySchema>

export class UpdateCampaignSchema extends createZodDto(
  updateCampaignBodySchema,
) {}

export class CreateCampaignSchema extends createZodDto(
  z.object({
    details: CampaignDetailsSchema,
    data: z.record(z.string(), z.unknown()).optional(),
    ballotReadyPositionId: z.string().nullish(),
    customPositionName: z.string().nullish(),
  }),
) {}

export class SetDistrictDTO extends createZodDto(
  z.object({
    slug: z.string().optional(),
    L2DistrictType: z.string(),
    L2DistrictName: z.string(),
  }),
) {}

export class SetDistrictM2MDTO extends createZodDto(
  z.object({
    L2DistrictType: z.string(),
    L2DistrictName: z.string(),
  }),
) {}
