import {
  BallotReadyPositionLevel,
  CampaignLaunchStatus,
  OnboardingStep,
} from '@goodparty_org/contracts'
import { Campaign, CampaignTier } from '@prisma/client'
import { GenerationStatus } from 'src/campaigns/ai/content/aiContent.types'
import { generateFactory } from './generate'

const FIXED_AI_CONTENT_TIMESTAMP = new Date('2024-01-01T00:00:00Z').getTime()

let campaignCounter = 1

export function resetCampaignCounter() {
  campaignCounter = 1
}

export const campaignFactory = generateFactory<Campaign>((args) => {
  // skip incrementing when id is provided so slug stays consistent with the given id
  const id = 'id' in args ? (args.id as number) : campaignCounter++
  const organizationSlug = `campaign-${id}`
  // NOTE: generationStatus can't go in the object literal below — TS errors on the
  // `& Record<string, AiContentData>` intersection. Use bracket notation instead.
  const aiContent: Campaign['aiContent'] = {
    launchSocialMediaCopy: {
      name: 'Launch Social Media Copy',
      content: '<p>Test campaign announcement</p>',
      updatedAt: FIXED_AI_CONTENT_TIMESTAMP,
      inputValues: {},
    },
  }
  aiContent['generationStatus'] = {
    launchSocialMediaCopy: {
      prompt: 'Generate launch social media copy',
      status: GenerationStatus.completed,
      createdAt: FIXED_AI_CONTENT_TIMESTAMP,
    },
  }
  return {
    id,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    organizationSlug: organizationSlug,
    slug: `test-campaign-${id}`,
    isActive: true,
    isVerified: false,
    isPro: false,
    isDemo: false,
    didWin: null,
    dateVerified: null,
    tier: CampaignTier.TOSSUP,
    formattedAddress: null,
    placeId: null,
    userId: 1,
    data: {
      currentStep: OnboardingStep.complete,
      launchStatus: CampaignLaunchStatus.launched,
    },
    details: {
      state: 'CA',
      zip: '90210',
      ballotLevel: BallotReadyPositionLevel.CITY,
      electionDate: '2024-11-05',
      primaryElectionDate: '2024-06-05',
      geoLocation: {},
      party: 'Independent',
      raceId: `race-${id}`,
      pledged: true,
      knowRun: 'yes',
      runForOffice: 'yes',
    },
    aiContent,
    vendorTsData: {},
    canDownloadFederal: false,
    hasFreeTextsOffer: false,
    freeTextsOfferRedeemedAt: null,
  }
})

export function createProCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return campaignFactory({ isPro: true, isVerified: true, ...overrides })
}

export function createCampaignWithUser(
  userId: number,
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({ userId, ...overrides })
}

export function createVerifiedCampaign(
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({
    isVerified: true,
    dateVerified: new Date('2024-01-15T00:00:00Z'),
    ...overrides,
  })
}

export function createDemoCampaign(
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({ isDemo: true, ...overrides })
}

export function createCampaignWithFreeTexts(
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({ hasFreeTextsOffer: true, ...overrides })
}

export function createProCampaignWithUser(
  userId: number,
  overrides: Partial<Campaign> = {},
): Campaign {
  return createProCampaign({ userId, ...overrides })
}
