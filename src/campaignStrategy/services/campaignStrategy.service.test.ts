import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Test, type TestingModule } from '@nestjs/testing'
import { Campaign, User } from '../../generated/prisma'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'src/prisma/prisma.service'
import { BadRequestException } from '@nestjs/common'
import { CampaignStrategyService } from './campaignStrategy.service'
import { CommunityEventsService } from './communityEvents.service'
import {
  ElectionApiRaceNotFoundError,
  ElectionApiService,
} from './electionApi.service'
import { StrategicLandscapeParamsService } from './strategicLandscapeParams.service'
import { StrategicLandscapePersister } from './strategicLandscape.persister'
import { ExperimentRunsService } from '@/agentExperiments/services/experimentRuns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { RacesService } from '@/elections/services/races.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { RaceContextFromApi } from '../types/electionApi.types'

// Strategic-landscape (CAP dispatch) behavior is covered in
// campaignStrategy.cap.test.ts. This file covers the community-events pipeline
// and the shared election-api 404 short-circuit.

const apiCtx: RaceContextFromApi = {
  state: 'CA',
  candidateOffice: 'City Council',
  officialOfficeName: 'Anytown Council',
  officeLevel: 'Local',
  officeType: 'Council',
  primaryElectionDate: '2026-06-01',
  generalElectionDate: '2026-11-01',
  relevantElectionDate: '2026-06-01',
  numberOfSeats: 1,
  projectedTurnout: 1000,
  civicsWinNumber: null,
  winNumberEstimate: 501,
  winNumberEffective: 501,
  contactsNeededEstimate: 2505,
  candidateCount: 2,
  candidates: [
    {
      gpCandidateId: 'a',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      websiteUrl: null,
      party: 'Independent',
      isIncumbent: null,
    },
    {
      gpCandidateId: 'b',
      firstName: 'Bob',
      lastName: 'Smith',
      fullName: 'Bob Smith',
      email: 'bob@example.com',
      websiteUrl: null,
      party: 'Nonpartisan',
      isIncumbent: true,
    },
  ],
}

const buildCampaign = (
  overrides: Partial<Campaign & { user: User }> = {},
): Campaign & { user: User } =>
  ({
    id: 99,
    organizationSlug: 'campaign-99',
    slug: 'jane',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    userId: 1,
    details: { party: 'Independent', raceId: 'hash-abc' },
    data: {},
    aiContent: {},
    vendorTsData: {},
    user: {
      id: 1,
      firstName: 'Jane',
      lastName: 'Doe',
      name: 'Jane Doe',
      email: 'jane@example.com',
    } as User,
    ...overrides,
  }) as Campaign & { user: User }

describe('CampaignStrategyService — community events', () => {
  let service: CampaignStrategyService
  let mockPrisma: {
    campaignStrategy: Record<
      | 'upsert'
      | 'findUnique'
      | 'findMany'
      | 'findFirst'
      | 'findFirstOrThrow'
      | 'findUniqueOrThrow'
      | 'count'
      | 'update'
      | 'updateMany',
      ReturnType<typeof vi.fn>
    >
  }
  let mockEvents: { generate: ReturnType<typeof vi.fn> }
  let mockElectionApi: { getRaceContext: ReturnType<typeof vi.fn> }
  let mockRaces: { getZipCodesByRaceId: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockPrisma = {
      campaignStrategy: {
        upsert: vi.fn().mockResolvedValue({ id: 42, campaignId: 99 }),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    }
    mockEvents = { generate: vi.fn() }
    mockElectionApi = { getRaceContext: vi.fn().mockResolvedValue(apiCtx) }
    mockRaces = {
      getZipCodesByRaceId: vi.fn().mockResolvedValue(['94110']),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        // CAP strategic-landscape deps — unused by these tests, no-op mocks.
        {
          provide: StrategicLandscapeParamsService,
          useValue: { build: vi.fn() },
        },
        {
          provide: ExperimentRunsService,
          useValue: {
            findUnique: vi.fn(),
            dispatchRun: vi.fn(),
            markFailed: vi.fn(),
          },
        },
        {
          provide: StrategicLandscapePersister,
          useValue: {
            persistOpponents: vi.fn(),
            persistOpportunitiesAndChallenges: vi.fn(),
          },
        },
        { provide: S3Service, useValue: { getFile: vi.fn() } },
        // Community-events deps — exercised below.
        { provide: CommunityEventsService, useValue: mockEvents },
        { provide: ElectionApiService, useValue: mockElectionApi },
        { provide: RacesService, useValue: mockRaces },
        { provide: PinoLogger, useValue: createMockLogger() },
        CampaignStrategyService,
      ],
    }).compile()
    await module.init()

    service = module.get<CampaignStrategyService>(CampaignStrategyService)
  })

  describe('getOrGenerateCommunityEvents', () => {
    const eventsDetails = {
      party: 'Independent',
      raceId: 'hash-abc',
      electionDate: '2026-11-03',
      state: 'CA',
      city: 'Anytown',
      zip: '94110',
    }

    it('returns { status: ready, data } when communityEvents column is populated', async () => {
      const cached = {
        events: [
          {
            title: 'Town Hall',
            description: 'Why',
            date: '2026-10-15',
            address: '123 Main St, Anytown, CA 90210',
            url: null,
          },
        ],
      }
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: cached,
      })

      const result = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )

      expect(result).toEqual({ status: 'ready', data: cached })
      expect(mockEvents.generate).not.toHaveBeenCalled()
    })

    it('returns { status: ready } with empty array when column is populated but has zero events', async () => {
      // Generated, found nothing must NOT re-poll forever. The persisted
      // shape `{ events: [] }` is a valid cache hit.
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: { events: [] },
      })

      const result = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )

      expect(result).toEqual({ status: 'ready', data: { events: [] } })
      expect(mockEvents.generate).not.toHaveBeenCalled()
    })

    it('treats malformed JSON as cache miss and kicks off generation', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        // Wrong shape — should fail Zod validation in readCommunityEvents.
        communityEvents: { unexpected: 'shape' },
      })

      const result = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )

      expect(result).toEqual({ status: 'generating' })
    })

    it('returns generating + kicks off background work on cache miss', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })

      const result = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )

      expect(result).toEqual({ status: 'generating' })
      await service.drainInFlight()
      expect(mockEvents.generate).toHaveBeenCalledTimes(1)
    })

    it('reuses the in-flight events slot for concurrent polls', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      // Hold the generation open so the second poll sees it in flight.
      // Placeholder is overwritten synchronously by the Promise executor below.
      let release: () => void = () => {
        /* replaced by Promise resolve */
      }
      mockEvents.generate.mockReturnValue(
        new Promise<void>((resolve) => {
          release = resolve
        }),
      )

      const r1 = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      const r2 = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )

      expect(r1).toEqual({ status: 'generating' })
      expect(r2).toEqual({ status: 'generating' })
      expect(mockEvents.generate).toHaveBeenCalledTimes(1)

      release()
      await service.drainInFlight()
    })

    it('throws BadRequest when raceId is missing', async () => {
      await expect(
        service.getOrGenerateCommunityEvents(
          buildCampaign({
            details: { electionDate: '2026-11-03' },
          }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockEvents.generate).not.toHaveBeenCalled()
    })

    it('throws BadRequest when electionDate is missing', async () => {
      await expect(
        service.getOrGenerateCommunityEvents(
          buildCampaign({
            details: { raceId: 'hash-abc' },
          }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockEvents.generate).not.toHaveBeenCalled()
    })

    it('uses the district zip resolver as the primary source for zip', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      // Resolver returns a zip distinct from both campaign.details.zip
      // ('94110') and the user's home zip — confirms the resolver wins.
      mockRaces.getZipCodesByRaceId.mockResolvedValueOnce(['10025', '10026'])

      await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      await service.drainInFlight()

      expect(mockRaces.getZipCodesByRaceId).toHaveBeenCalledWith('hash-abc')
      const ctx = mockEvents.generate.mock.calls[0]?.[2]
      // All resolver zips join into a single comma-separated value so the
      // LLM has full geographic coverage of the district.
      expect(ctx?.zip).toBe('10025, 10026')
    })

    it('falls back to campaign zip when the resolver throws', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      mockRaces.getZipCodesByRaceId.mockRejectedValueOnce(
        new Error('br lookup failed'),
      )

      await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      await service.drainInFlight()

      const ctx = mockEvents.generate.mock.calls[0]?.[2]
      expect(ctx?.zip).toBe('94110')
    })

    it('drops the zip entirely when the resolver returns a statewide-sized array', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      // 76 zips trips the STATEWIDE_ZIP_THRESHOLD (75) — for statewide
      // races the campaign's home zip isn't representative of where the
      // candidate actually operates, so the resolver returns '' and the
      // prompt renders the zip field as "not available". The LLM reasons
      // from officeName + state + city for these races.
      const statewideZips = Array.from(
        { length: 76 },
        (_, i) => `9${i.toString().padStart(4, '0')}`,
      )
      mockRaces.getZipCodesByRaceId.mockResolvedValueOnce(statewideZips)

      await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      await service.drainInFlight()

      const ctx = mockEvents.generate.mock.calls[0]?.[2]
      expect(ctx?.zip).toBe('')
    })

    it('falls back to campaign zip when the resolver returns an empty array', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      // BR has the race but no zips on file for its position — still a
      // recoverable case where the candidate's home zip is useful.
      mockRaces.getZipCodesByRaceId.mockResolvedValueOnce([])

      await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      await service.drainInFlight()

      const ctx = mockEvents.generate.mock.calls[0]?.[2]
      expect(ctx?.zip).toBe('94110')
    })

    it('passes all zips comma-separated when count is at the threshold', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      // 75 zips is exactly at the threshold and should be included in full.
      const districtZips = Array.from(
        { length: 75 },
        (_, i) => `9${i.toString().padStart(4, '0')}`,
      )
      mockRaces.getZipCodesByRaceId.mockResolvedValueOnce(districtZips)

      await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      await service.drainInFlight()

      const ctx = mockEvents.generate.mock.calls[0]?.[2]
      expect(ctx?.zip).toBe(districtZips.join(', '))
    })
  })

  // Breaks the infinite-poll loop when election-api has no Race row for
  // the candidate's brHashId. Without this, every 3s poll re-kicks
  // generation and the background hits the same 404 every time —
  // unbounded log noise, unbounded gp-api → election-api traffic, and
  // the webapp shows a skeleton forever.
  describe('election-api 404 → race-data-unavailable short-circuit', () => {
    it('community-events: marks the campaign unavailable on 404 and returns ready+empty on subsequent polls', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue({
        communityEvents: null,
      })
      mockElectionApi.getRaceContext.mockRejectedValueOnce(
        new ElectionApiRaceNotFoundError('hash-abc'),
      )
      const eventsDetails = {
        party: 'Independent',
        raceId: 'hash-abc',
        electionDate: '2026-11-03',
        state: 'CA',
        city: 'Anytown',
        zip: '94110',
      }

      const first = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      expect(first).toEqual({ status: 'generating' })

      await service.drainInFlight()
      expect(mockEvents.generate).not.toHaveBeenCalled()

      mockElectionApi.getRaceContext.mockClear()
      const second = await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      expect(second).toEqual({ status: 'ready', data: { events: [] } })
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
      expect(mockEvents.generate).not.toHaveBeenCalled()
    })
  })
})
