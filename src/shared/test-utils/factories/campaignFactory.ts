import { Campaign, CampaignTier } from '@prisma/client'
import {
  BallotReadyPositionLevel,
  CampaignLaunchStatus,
  OnboardingStep,
} from '@goodparty_org/contracts'
import { GenerationStatus } from 'src/campaigns/ai/content/aiContent.types'
import { generateFactory } from './generate'

/**
 * Fixed timestamp used for aiContent fields — avoids non-determinism from Date.now()
 * which would cause deep equality assertions to fail between factory calls.
 */
const FIXED_AI_CONTENT_TIMESTAMP = new Date('2024-01-01T00:00:00Z').getTime()

/**
 * Counter for generating unique campaign data in tests
 */
let campaignCounter = 1

/**
 * Reset the campaign counter (useful for test isolation)
 */
export function resetCampaignCounter() {
  campaignCounter = 1
}

/**
 * Factory for creating test Campaign entities
 * Provides predictable defaults suitable for testing
 *
 * @example
 * // Create a basic campaign
 * const campaign = campaignFactory({ userId: 1 })
 *
 * // Create a pro campaign
 * const proCampaign = campaignFactory({ userId: 1, isPro: true })
 */
export const campaignFactory = generateFactory<Campaign>((args) => {
  // Only advance the counter when id is not being overridden, so that
  // campaignFactory({ id: 99 }) produces a consistent { id: 99, slug: 'test-campaign-99' }
  // without consuming a counter slot.
  const id = 'id' in args ? (args.id as number) : campaignCounter++
  // NOTE: putting generationStatus in the object literal below gives a TS error
  // due to the `& Record<string, AiContentData>` intersection in CampaignAiContent.
  // Assign it via bracket notation after creation instead (same pattern as seed factory).
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
    organizationSlug: null,
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
    userId: 1, // Default userId, should typically be overridden
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
      office: 'City Council',
      raceId: `race-${id}`,
      pledged: true,
      knowRun: 'yes',
      runForOffice: 'yes',
    },
    aiContent,
    vendorTsData: {},
    completedTaskIds: [],
    canDownloadFederal: false,
    hasFreeTextsOffer: false,
    freeTextsOfferRedeemedAt: null,
  }
})

/**
 * Create a campaign with isPro: true
 * Pro campaigns have access to premium features
 *
 * @example
 * const proCampaign = createProCampaign({ userId: 1 })
 */
export function createProCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return campaignFactory({
    isPro: true,
    isVerified: true,
    ...overrides,
  })
}

/**
 * Create a campaign with a specific user ID
 *
 * @example
 * const user = userFactory()
 * const campaign = createCampaignWithUser(user.id)
 */
export function createCampaignWithUser(
  userId: number,
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({
    userId,
    ...overrides,
  })
}

/**
 * Create a verified campaign
 */
export function createVerifiedCampaign(
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({
    isVerified: true,
    dateVerified: new Date('2024-01-15T00:00:00Z'),
    ...overrides,
  })
}

/**
 * Create a demo campaign
 */
export function createDemoCampaign(
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({
    isDemo: true,
    ...overrides,
  })
}

/**
 * Create a campaign with free texts offer
 */
export function createCampaignWithFreeTexts(
  overrides: Partial<Campaign> = {},
): Campaign {
  return campaignFactory({
    hasFreeTextsOffer: true,
    ...overrides,
  })
}

/**
 * Create a pro campaign with a specific user ID (common combination)
 */
export function createProCampaignWithUser(
  userId: number,
  overrides: Partial<Campaign> = {},
): Campaign {
  return createProCampaign({
    userId,
    ...overrides,
  })
}
