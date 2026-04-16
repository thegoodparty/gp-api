import { VoterFileDownloadAccessService } from '@/shared/services/voterFileDownloadAccess.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { SlackService } from '@/vendors/slack/services/slack.service'
import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import { Campaign } from '@prisma/client'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('VoterFileDownloadAccessService - canDownload', () => {
  let service: VoterFileDownloadAccessService
  let mockLogger: PinoLogger

  beforeEach(async () => {
    const mockSlackService = {
      message: vi.fn(),
      errorMessage: vi.fn(),
    }

    mockLogger = createMockLogger()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoterFileDownloadAccessService,
        { provide: PinoLogger, useValue: mockLogger },
        {
          provide: SlackService,
          useValue: mockSlackService,
        },
      ],
    }).compile()

    service = module.get<VoterFileDownloadAccessService>(
      VoterFileDownloadAccessService,
    )
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Edge cases - null/undefined campaign', () => {
    it('should return false when campaign is undefined', () => {
      expect(service.canDownload(undefined)).toBe(false)
      expect(mockLogger.info).not.toHaveBeenCalled()
    })
  })

  describe('Local races - should return true immediately (race condition fix)', () => {
    it('should return true for CITY campaigns immediately', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
      })
      expect(service.canDownload(campaign)).toBe(true)
      expect(mockLogger.info).not.toHaveBeenCalled()
    })

    it('should return true for TOWNSHIP campaigns immediately', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.TOWNSHIP },
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
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for local races even if canDownloadFederal is false', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
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
      expect(mockLogger.info).not.toHaveBeenCalled()
    })

    it('should return true for STATE with canDownloadFederal flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: true,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for FEDERAL with flag without district data', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: true,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })
  })

  describe('FEDERAL/STATE races - with district from Organization', () => {
    it('should return true for FEDERAL with district', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
      })
      expect(
        service.canDownload(campaign, {
          id: 'dist-1',
          l2Type: 'US House',
          l2Name: 'CA-12',
        }),
      ).toBe(true)
    })

    it('should return true for STATE with district', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: false,
      })
      expect(
        service.canDownload(campaign, {
          id: 'dist-2',
          l2Type: 'State Senate',
          l2Name: 'CA-15',
        }),
      ).toBe(true)
    })

    it('should return false for FEDERAL with only l2Type (missing l2Name)', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
      })
      expect(
        service.canDownload(campaign, {
          id: 'dist-1',
          l2Type: 'US House',
          l2Name: '',
        }),
      ).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        { id: campaign.id },
        'Campaign is not eligible for download.',
      )
    })

    it('should return false for STATE with no district', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign, null)).toBe(false)
    })

    it('should return false for FEDERAL without district or flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(false)
    })

    it('should return false for STATE without district or flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.STATE },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(false)
    })
  })

  describe('Edge cases - missing or invalid ballotLevel', () => {
    it('should return false when ballotLevel is undefined', () => {
      const campaign = createMockCampaign({
        details: {},
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        { id: campaign.id },
        'Campaign is not eligible for download.',
      )
    })

    it('should return true when ballotLevel is missing but district exists', () => {
      const campaign = createMockCampaign({
        details: {},
        canDownloadFederal: false,
      })
      expect(
        service.canDownload(campaign, {
          id: 'dist-1',
          l2Type: 'US House',
          l2Name: 'CA-12',
        }),
      ).toBe(true)
    })

    it('should return false when ballotLevel is missing and no district', () => {
      const campaign = createMockCampaign({
        details: {},
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign, null)).toBe(false)
    })
  })

  describe('Race condition scenarios (the original bug)', () => {
    it('should return true for CITY immediately, simulating an early frontend check', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return true for TOWNSHIP immediately, simulating an early frontend check', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.TOWNSHIP },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should return false for FEDERAL without district or flag (expected behavior)', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(false)
    })
  })

  describe('Business logic validation - priority order', () => {
    it('should prioritize local race check over district check', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
      })
      expect(
        service.canDownload(campaign, {
          id: 'dist-3',
          l2Type: 'City Council',
          l2Name: 'District 1',
        }),
      ).toBe(true)
    })

    it('should prioritize canDownloadFederal flag over district for FEDERAL', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: true,
      })
      expect(service.canDownload(campaign, null)).toBe(true)
    })

    it('should allow district as fallback for FEDERAL without flag', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
      })
      expect(
        service.canDownload(campaign, {
          id: 'dist-1',
          l2Type: 'US House',
          l2Name: 'CA-12',
        }),
      ).toBe(true)
    })

    it('should return false when all conditions fail', () => {
      const campaign = createMockCampaign({
        details: { ballotLevel: BallotReadyPositionLevel.FEDERAL },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        { id: campaign.id },
        'Campaign is not eligible for download.',
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
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should handle Linsey Grove scenario (CITY race)', () => {
      const campaign = createMockCampaign({
        id: 166673,
        details: { ballotLevel: BallotReadyPositionLevel.CITY },
        canDownloadFederal: false,
      })
      expect(service.canDownload(campaign)).toBe(true)
    })

    it('should handle Lynn Ogbourne scenario (TOWNSHIP race)', () => {
      const campaign = createMockCampaign({
        id: 142383,
        details: { ballotLevel: BallotReadyPositionLevel.TOWNSHIP },
        canDownloadFederal: false,
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
    id?: number
    slug?: string
  } = {},
): Campaign {
  return {
    id: overrides.id ?? 1,
    organizationSlug: `campaign-${overrides.id ?? 1}`,
    slug: overrides.slug ?? 'test-campaign',
    details: overrides.details ?? {},
    canDownloadFederal: overrides.canDownloadFederal ?? false,
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
    freeTextsOfferRedeemedAt: null,
  }
}
