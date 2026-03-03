import { Campaign, CampaignTier } from '@prisma/client'
import { CampaignLaunchStatus, OnboardingStep } from '@goodparty_org/contracts'
import { GenerationStatus } from 'src/campaigns/ai/content/aiContent.types'
import { generateFactory } from './generate'

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
export const campaignFactory = generateFactory<Campaign>(() => {
  const id = campaignCounter++
  // NOTE: putting generationStatus in the object literal below gives a TS error
  // due to the `& Record<string, AiContentData>` intersection in CampaignAiContent.
  // Assign it via bracket notation after creation instead (same pattern as seed factory).
  const aiContent: Campaign['aiContent'] = {
    launchSocialMediaCopy: {
      name: 'Launch Social Media Copy',
      content: '<p>Test campaign announcement</p>',
      updatedAt: Date.now(),
      inputValues: {},
    },
  }
  aiContent['generationStatus'] = {
    launchSocialMediaCopy: {
      prompt: 'Generate launch social media copy',
      status: GenerationStatus.completed,
      createdAt: Date.now(),
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
      ballotLevel: 'CITY',
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
