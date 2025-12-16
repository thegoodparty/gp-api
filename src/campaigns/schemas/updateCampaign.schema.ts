import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  BallotReadyPositionLevel,
  ElectionLevel,
} from 'src/campaigns/campaigns.types'

// AI'ed from the CampaignDetails type
const CampaignDetailsSchema = z
  .object({
    state: z.string(),
    ballotLevel: z.nativeEnum(BallotReadyPositionLevel),
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
    level: z.nativeEnum(ElectionLevel),
    noNormalizedOffice: z.boolean(),
    website: z.string(),
    pastExperience: z.union([z.string(), z.record(z.string(), z.string())]),
    occupation: z.string(),
    funFact: z.string(),
    campaignCommittee: z.string(),
    statementName: z.string(),
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
  z
    .object({
      slug: z.string().optional(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: z.record(z.string(), z.unknown()).optional(),
      details: CampaignDetailsSchema.optional(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      pathToVictory: z.record(z.string(), z.unknown()).optional(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      aiContent: z.record(z.string(), z.unknown()).optional(),
      formattedAddress: z.string().optional(),
      placeId: z.string().optional(),
      canDownloadFederal: z.boolean().optional(),
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
