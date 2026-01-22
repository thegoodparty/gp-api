import {
  BallotReadyPositionLevel,
  CampaignWith,
} from '@/campaigns/campaigns.types'
import { VoterFileDownloadAccessService } from '@/shared/services/voterFileDownloadAccess.service'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('VoterFileDownloadAccessService - canDownload', () => {
  let service: VoterFileDownloadAccessService
  let loggerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    const mockSlackService = {
      message: vi.fn(),
      errorMessage: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoterFileDownloadAccessService,
        {
          provide: SlackService,
          useValue: mockSlackService,
        },
      ],
    }).compile()

    service = module.get<VoterFileDownloadAccessService>(
      VoterFileDownloadAccessService,
    )
    loggerSpy = vi.spyOn(Logger.prototype, 'log')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Edge cases - null/undefined campaign', () => {
    it('should return false when campaign is undefined', () => {
      expect(service.canDownload(undefined)).toBe(false)
      expect(loggerSpy).not.toHaveBeenCalled()
    })
  })

  describe('Local races - should return true immediately (race condition fix)', () => {
    it('should return true for CITY campaigns immediately, even without pathToVictory', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
      expect(loggerSpy).not.toHaveBeenCalled()
    })

    it('should return true for TOWNSHIP campaigns immediately, even without pathToVictory', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.TOWNSHIP },
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for COUNTY campaigns immediately', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.COUNTY },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for LOCAL campaigns immediately', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.LOCAL },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for REGIONAL campaigns immediately', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.REGIONAL },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for local races even without electionType/electionLocation', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        pathToVictory: { data: {} },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for local races even if canDownloadFederal is false', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })
  })

  describe('FEDERAL/STATE races - with canDownloadFederal flag', () => {
    it('should return true for FEDERAL with canDownloadFederal flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: true,
      })
      expect(service.canDownload(campaign)).toBe(true)
      expect(loggerSpy).not.toHaveBeenCalled()
    })

    it('should return true for STATE with canDownloadFederal flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: true,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for FEDERAL with flag, even without pathToVictory', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: true,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })
  })

  describe('FEDERAL/STATE races - with electionType/electionLocation (SQS job completed)', () => {
    it('should return true for FEDERAL with electionType and electionLocation', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
        pathToVictory: {
          data: {
            electionType: 'US House',
            electionLocation: 'CA-12',
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for STATE with electionType and electionLocation', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: false,
        pathToVictory: {
          data: {
            electionType: 'State Senate',
            electionLocation: 'CA-15',
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return false for FEDERAL with only electionType (missing electionLocation)', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
        pathToVictory: {
          data: {
            electionType: 'US House',
            // missing electionLocation
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(false)
      expect(loggerSpy).toHaveBeenCalledWith(
        'Campaign is not eligible for download.',
        campaign.id,
      )
    })

    it('should return false for STATE with only electionLocation (missing electionType)', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: false,
        pathToVictory: {
          data: {
            // missing electionType
            electionLocation: 'CA-15',
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(false)
    })

    it('should return false for FEDERAL without data or flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
        pathToVictory: { data: {} },
      })
      expect(service.canDownload(campaign)).toBe(false)
    })

    it('should return false for STATE without data or flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(false)
    })
  })

  describe('Edge cases - missing or invalid ballotLevel', () => {
    it('should return false when ballotLevel is undefined', () => {
      const campaign = createMockCampaign({
        details: {},
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(false)
      expect(loggerSpy).toHaveBeenCalledWith(
        'Campaign is not eligible for download.',
        campaign.id,
      )
    })

    it('should return true when ballotLevel is missing but electionType/electionLocation exist', () => {
      // This tests the fallback behavior - allows download if election data exists
      const campaign = createMockCampaign({
        details: {}, // No ballotLevel
        canDownloadFederal: false,
        pathToVictory: {
          data: {
            electionType: 'US House',
            electionLocation: 'CA-12',
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return false when ballotLevel is missing and no election data', () => {
      const campaign = createMockCampaign({
        details: {}, // No ballotLevel
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(false)
    })
  })

  describe('Race condition scenarios (the original bug)', () => {
    it('should return true for CITY immediately, simulating frontend check before SQS job completes', () => {
      // This is the exact scenario that was failing:
      // Frontend checks canDownload before PathToVictory SQS job populates electionType/electionLocation
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
        pathToVictory: null, // SQS job hasn't run yet
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for TOWNSHIP immediately, simulating frontend check before SQS job completes', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.TOWNSHIP },
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return false for FEDERAL before SQS job completes (expected behavior)', () => {
      // FEDERAL/STATE races correctly require election data or flag
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
        pathToVictory: null, // SQS job hasn't run yet
      })
      expect(service.canDownload(campaign)).toBe(false)
    })
  })

  describe('Business logic validation - priority order', () => {
    it('should prioritize local race check over election data check', () => {
      // Even if a local race has election data, it should return true from first condition
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        pathToVictory: {
          data: {
            electionType: 'City Council',
            electionLocation: 'District 1',
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should prioritize canDownloadFederal flag over election data for FEDERAL', () => {
      // Flag should work even without election data
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: true,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should allow election data as fallback for FEDERAL without flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
        pathToVictory: {
          data: {
            electionType: 'US House',
            electionLocation: 'CA-12',
          },
        },
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return false when all conditions fail', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
        pathToVictory: { data: {} },
      })
      expect(service.canDownload(campaign)).toBe(false)
      expect(loggerSpy).toHaveBeenCalledWith(
        'Campaign is not eligible for download.',
        campaign.id,
      )
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle George Syrop scenario (CITY race)', () => {
      // Based on the original bug report
      const campaign = createMockCampaign({
        id: 292900,
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should handle Linsey Grove scenario (CITY race)', () => {
      const campaign = createMockCampaign({
        id: 166673,
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should handle Lynn Ogbourne scenario (TOWNSHIP race)', () => {
      const campaign = createMockCampaign({
        id: 142383,
        details: { ballotLevel: BallotReadyPositionLevel.TOWNSHIP },
        canDownloadFederal: false,
        pathToVictory: null,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })
  })
})

// Helper to create mock campaign
function createMockCampaign(
  overrides: {
    details?: { ballotLevel?: BallotReadyPositionLevel }
    canDownloadFederal?: boolean
    pathToVictory?: {
      data?: { electionType?: string; electionLocation?: string }
    } | null
    id?: number
    slug?: string
  } = {},
): CampaignWith<'pathToVictory'> {
  // Construct full PathToVictory object if data is provided
  const pathToVictory =
    overrides.pathToVictory === null
      ? null
      : overrides.pathToVictory?.data
        ? {
          id: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          campaignId: overrides.id ?? 1,
          data: overrides.pathToVictory.data,
        }
        : null

  return {
    id: overrides.id ?? 1,
    slug: overrides.slug ?? 'test-campaign',
    details: overrides.details ?? {},
    canDownloadFederal: overrides.canDownloadFederal ?? false,
    pathToVictory,
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: false,
    isVerified: null,
    isPro: null,
    isDemo: false,
    didWin: null,
    dateVerified: null,
    tier: null,
    formattedAddress: null,
    placeId: null,
    userId: 1,
    data: {},
    aiContent: {},
    vendorTsData: {},
    completedTaskIds: [],
    hasFreeTextsOffer: false,
  }
}
