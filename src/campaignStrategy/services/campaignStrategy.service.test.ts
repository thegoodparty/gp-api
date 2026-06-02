import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Test, type TestingModule } from '@nestjs/testing'
import { Campaign, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { PrismaService } from 'src/prisma/prisma.service'
import { BadRequestException } from '@nestjs/common'
import { CampaignStrategyService } from './campaignStrategy.service'
import { CommunityEventsService } from './communityEvents.service'
import {
  ElectionApiRaceNotFoundError,
  ElectionApiService,
} from './electionApi.service'
import { StrategicLandscapeService } from './strategicLandscape.service'
import { RacesService } from '@/elections/services/races.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { RaceContextFromApi } from '../types/electionApi.types'

const buildPlanRow = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  campaignId: 99,
  createdAt: new Date(),
  updatedAt: new Date(),
  opportunities: [],
  challenges: [],
  opponents: [],
  ...overrides,
})

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

const cachedPlan = (overrides: Record<string, unknown> = {}) =>
  buildPlanRow({
    opportunities: [
      { order: 1, content: 'o1' },
      { order: 2, content: 'o2' },
      { order: 3, content: 'o3' },
    ],
    challenges: [
      { order: 1, content: 'c1' },
      { order: 2, content: 'c2' },
      { order: 3, content: 'c3' },
    ],
    opponents: [],
    ...overrides,
  })

describe('CampaignStrategyService', () => {
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
      | 'update',
      ReturnType<typeof vi.fn>
    >
  }
  let mockStrategic: { generate: ReturnType<typeof vi.fn> }
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
      },
    }
    mockStrategic = { generate: vi.fn() }
    mockEvents = { generate: vi.fn() }
    mockElectionApi = { getRaceContext: vi.fn().mockResolvedValue(apiCtx) }
    mockRaces = {
      getZipCodesByRaceId: vi.fn().mockResolvedValue(['94110']),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StrategicLandscapeService, useValue: mockStrategic },
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

  describe('getOrGenerateStrategicLandscape — cache hits', () => {
    it('returns { status: ready, data } when opportunities already exist', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(
        cachedPlan({
          opponents: [
            {
              fullName: 'Bob',
              partyAffiliation: 'Nonpartisan',
              incumbent: true,
              politicalSummary: 'background',
              keyFacts: [{ order: 1, content: 'fact1' }],
              websites: [{ url: 'https://bob.example' }],
            },
          ],
        }),
      )

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result).toEqual({
        status: 'ready',
        data: {
          opportunities: ['o1', 'o2', 'o3'],
          challenges: ['c1', 'c2', 'c3'],
          opponents: [
            {
              fullName: 'Bob',
              partyAffiliation: 'Nonpartisan',
              incumbent: true,
              politicalSummary: 'background',
              keyFacts: ['fact1'],
              websites: ['https://bob.example'],
            },
          ],
        },
      })
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

    it('treats the plan as cached when opportunities are empty but challenges or opponents exist', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(
        buildPlanRow({
          opportunities: [],
          challenges: [
            { order: 1, content: 'c1' },
            { order: 2, content: 'c2' },
            { order: 3, content: 'c3' },
          ],
          opponents: [],
        }),
      )

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result.status).toBe('ready')
      if (result.status !== 'ready') return
      expect(result.data.challenges).toEqual(['c1', 'c2', 'c3'])
      expect(result.data.opportunities).toEqual([])
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })
  })

  describe('getOrGenerateStrategicLandscape — cache misses kick off background generation', () => {
    it('returns { status: generating } immediately and runs generate in the background', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(result).toEqual({ status: 'generating' })

      await service.drainInFlight()

      const { candidates: _candidates, ...apiCtxScalars } = apiCtx
      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({
          ...apiCtxScalars,
          userFullName: 'Jane Doe',
          userPartyAffiliation: 'Independent',
        }),
      )
      expect(mockElectionApi.getRaceContext).toHaveBeenCalledWith('hash-abc')
    })

    it('subsequent polls during the same in-flight generation do not re-kick generate', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      let resolveGenerate: () => void = () => undefined
      mockStrategic.generate.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveGenerate = resolve
        }),
      )

      const first =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      const second =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      const third =
        await service.getOrGenerateStrategicLandscape(buildCampaign())

      expect(first).toEqual({ status: 'generating' })
      expect(second).toEqual({ status: 'generating' })
      expect(third).toEqual({ status: 'generating' })
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)

      resolveGenerate()
      await service.drainInFlight()
    })

    it('once generation completes, the next poll returns ready from cache', async () => {
      mockPrisma.campaignStrategy.findUnique
        .mockResolvedValueOnce(buildPlanRow())
        .mockResolvedValueOnce(cachedPlan())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })

      const kickoff =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(kickoff).toEqual({ status: 'generating' })

      await service.drainInFlight()

      const followUp =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(followUp.status).toBe('ready')
      if (followUp.status !== 'ready') return
      expect(followUp.data.opportunities).toEqual(['o1', 'o2', 'o3'])
    })

    it('swallows P2002 concurrent-write failures so the next poll picks up the winner', async () => {
      const winnerRow = cachedPlan({
        opportunities: [
          { order: 1, content: 'w1' },
          { order: 2, content: 'w2' },
          { order: 3, content: 'w3' },
        ],
      })
      mockPrisma.campaignStrategy.findUnique
        .mockResolvedValueOnce(buildPlanRow())
        .mockResolvedValueOnce(winnerRow)

      const p2002 = Object.assign(new Error('Unique constraint failed'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      })
      mockStrategic.generate.mockRejectedValue(p2002)

      const kickoff =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(kickoff).toEqual({ status: 'generating' })

      await service.drainInFlight()

      const followUp =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(followUp.status).toBe('ready')
      if (followUp.status !== 'ready') return
      expect(followUp.data.opportunities).toEqual(['w1', 'w2', 'w3'])
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)
    })

    it('clears the in-flight slot on non-P2002 failure so the next poll retries', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockRejectedValueOnce(new Error('llm down'))

      const first =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(first).toEqual({ status: 'generating' })
      await service.drainInFlight()

      mockStrategic.generate.mockResolvedValueOnce({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })
      const second =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(second).toEqual({ status: 'generating' })

      await service.drainInFlight()
      expect(mockStrategic.generate).toHaveBeenCalledTimes(2)
    })
  })

  describe('getOrGenerateStrategicLandscape — race context stitching', () => {
    it('falls back to details.otherParty when party is "Other"', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          details: {
            party: 'Other',
            otherParty: 'Pirate Party',
            raceId: 'hash-abc',
          },
        }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: 'Pirate Party' }),
      )
    })

    it('returns empty userPartyAffiliation when party is "Other" but otherParty is missing', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          details: { party: 'Other', raceId: 'hash-abc' },
        }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: '' }),
      )
    })

    it('uses details.party verbatim when not "Other"', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({ details: { party: 'Green', raceId: 'hash-abc' } }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userPartyAffiliation: 'Green' }),
      )
    })

    it('derives userFullName via firstName + lastName, falling back to name', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: null,
            lastName: null,
            name: 'Solo Name',
            email: 'solo@example.com',
          } as User,
        }),
      )
      await service.drainInFlight()

      expect(mockStrategic.generate).toHaveBeenCalledWith(
        42,
        99,
        expect.objectContaining({ userFullName: 'Solo Name' }),
      )
    })

    it('flags the candidate matching the user email as isUser=true', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(buildCampaign())
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      const flagged = candidates.filter((c) => c.isUser)
      expect(flagged).toHaveLength(1)
      expect(flagged[0].fullName).toBe('Jane Doe')
    })

    it('matches by email case-insensitively', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: 'Jane',
            lastName: 'Doe',
            name: 'Jane Doe',
            email: 'JANE@EXAMPLE.COM',
          } as User,
        }),
      )
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates.find((c) => c.fullName === 'Jane Doe')?.isUser).toBe(
        true,
      )
    })

    it('falls back to full_name match when the candidate email is null', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      mockElectionApi.getRaceContext.mockResolvedValueOnce({
        ...apiCtx,
        candidates: [
          {
            gpCandidateId: 'z',
            firstName: 'Jane',
            lastName: 'Doe',
            fullName: 'Jane Doe',
            email: null,
            websiteUrl: null,
            party: null,
            isIncumbent: null,
          },
        ],
        candidateCount: 1,
      })

      await service.getOrGenerateStrategicLandscape(buildCampaign())
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates[0].isUser).toBe(true)
    })

    it('collapses internal whitespace before matching by name', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      mockElectionApi.getRaceContext.mockResolvedValueOnce({
        ...apiCtx,
        candidates: [
          {
            gpCandidateId: 'z',
            firstName: 'Rose ',
            lastName: 'Ashton ',
            fullName: 'Rose  Ashton ',
            email: null,
            websiteUrl: null,
            party: null,
            isIncumbent: null,
          },
        ],
        candidateCount: 1,
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: 'Rose',
            lastName: 'Ashton',
            name: 'Rose Ashton',
            email: null as string | null,
          } as User,
        }),
      )
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates[0].isUser).toBe(true)
    })

    it('flags no candidate when no email or name match', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockStrategic.generate.mockResolvedValue({
        opportunities: ['a', 'b', 'c'],
        challenges: ['a', 'b', 'c'],
        opponents: [],
      })

      await service.getOrGenerateStrategicLandscape(
        buildCampaign({
          user: {
            id: 1,
            firstName: 'No',
            lastName: 'Match',
            name: 'No Match',
            email: 'nomatch@example.com',
          } as User,
        }),
      )
      await service.drainInFlight()

      const call = mockStrategic.generate.mock.calls[0]
      const candidates = (
        call[2] as { candidates: Array<{ fullName: string; isUser: boolean }> }
      ).candidates
      expect(candidates.every((c) => !c.isUser)).toBe(true)
    })
  })

  describe('getOrGenerateStrategicLandscape — preconditions', () => {
    it('throws BadRequest when campaign.details has no raceId', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())

      await expect(
        service.getOrGenerateStrategicLandscape(
          buildCampaign({ details: { party: 'Independent' } }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

    it('throws BadRequest when campaign.details.raceId is whitespace-only', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())

      await expect(
        service.getOrGenerateStrategicLandscape(
          buildCampaign({
            details: { party: 'Independent', raceId: '   ' },
          }),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
    })

    // Regression: details has raceId populated AND a sibling field with a
    // literal `null` value (zip is the common one — manual entry leaves it
    // null even on structured-office campaigns). CampaignDetailsSchema's
    // fields must be `.nullable()` so safeParse doesn't reject the whole
    // object on the null sibling and force resolveRaceId to throw "no
    // raceId" for a campaign that clearly has one.
    it('accepts a valid raceId even when other detail fields are null', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())

      await expect(
        service.getOrGenerateStrategicLandscape(
          buildCampaign({
            details: {
              party: 'Independent',
              raceId: 'hash-abc',
              zip: null,
              city: null,
            } as unknown as Campaign['details'],
          }),
        ),
      ).resolves.toEqual({ status: 'generating' })
      await service.drainInFlight()
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)
    })

    // Regression: Prisma's `upsert` does a SELECT-then-INSERT under the
    // hood and is NOT atomic in Postgres. Two concurrent
    // getOrGenerateXxx calls for the same brand-new campaign both see
    // "no row" and both try INSERT — the second trips
    // @@unique([campaign_id]) with P2002. Without the retry in
    // upsertForCampaign that surfaces as a 409 to the client (e.g. the
    // back-to-back pre-warm POSTs from OnboardingFlow). The retry path
    // catches P2002 and re-fetches the now-existing row.
    it('swallows P2002 from a concurrent upsert and re-fetches the row', async () => {
      // `isUniqueConstraintError` checks `name === 'PrismaClientKnownRequestError'`
      // (the library-loaded-from-two-paths-dual-ESM-CJS guard documented
      // in `prismaErrors.util.ts`), so the fixture must set that exact name.
      const upsertError = Object.assign(
        new Error('Unique constraint failed on the fields: (`campaign_id`)'),
        {
          name: 'PrismaClientKnownRequestError',
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['campaign_id'] },
        },
      )
      mockPrisma.campaignStrategy.upsert.mockRejectedValueOnce(upsertError)
      mockPrisma.campaignStrategy.findUniqueOrThrow.mockResolvedValueOnce({
        id: 42,
        campaignId: 99,
      })
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())

      await expect(
        service.getOrGenerateStrategicLandscape(buildCampaign()),
      ).resolves.toEqual({ status: 'generating' })
      expect(
        mockPrisma.campaignStrategy.findUniqueOrThrow,
      ).toHaveBeenCalledWith({ where: { campaignId: 99 } })
      await service.drainInFlight()
    })
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
    it('strategic-landscape: marks the campaign unavailable on 404 and returns ready+empty on subsequent polls', async () => {
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockElectionApi.getRaceContext.mockRejectedValueOnce(
        new ElectionApiRaceNotFoundError('hash-abc'),
      )

      // First call: kicks generation, gets 'generating' synchronously.
      const first =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(first).toEqual({ status: 'generating' })

      // Background generation runs, hits the 404, marks campaign as
      // race-data-unavailable.
      await service.drainInFlight()
      expect(mockStrategic.generate).not.toHaveBeenCalled()

      // Second call: short-circuits to ready+empty without re-kicking.
      // mockElectionApi.getRaceContext is NOT called again (mockRejectedValueOnce
      // would have returned undefined on a second call).
      mockElectionApi.getRaceContext.mockClear()
      const second =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(second).toEqual({
        status: 'ready',
        data: { opportunities: [], challenges: [], opponents: [] },
      })
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
      expect(mockStrategic.generate).not.toHaveBeenCalled()
    })

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

    it('cache is shared across pipelines: a 404 on community-events short-circuits strategic-landscape too', async () => {
      // Both pipelines call electionApi.getRaceContext, so a single 404
      // proves the race won't resolve for either. The other pipeline
      // shouldn't have to learn that lesson independently.
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
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

      // Community-events 404s and marks unavailable.
      await service.getOrGenerateCommunityEvents(
        buildCampaign({ details: eventsDetails }),
      )
      await service.drainInFlight()

      // Strategic-landscape on the same campaign should now also
      // short-circuit without ever hitting electionApi.
      mockElectionApi.getRaceContext.mockClear()
      const result = await service.getOrGenerateStrategicLandscape(
        buildCampaign({ details: eventsDetails }),
      )
      expect(result).toEqual({
        status: 'ready',
        data: { opportunities: [], challenges: [], opponents: [] },
      })
      expect(mockElectionApi.getRaceContext).not.toHaveBeenCalled()
    })

    it('non-404 election-api failures do NOT mark the race unavailable (transient errors should retry)', async () => {
      // A 5xx or network timeout from election-api is transient and
      // could clear on the next poll. We only want to short-circuit
      // for the permanent "race not in DB" case, not for blips.
      mockPrisma.campaignStrategy.findUnique.mockResolvedValue(buildPlanRow())
      mockElectionApi.getRaceContext.mockRejectedValueOnce(
        new Error('election-api request failed'),
      )

      await service.getOrGenerateStrategicLandscape(buildCampaign())
      await service.drainInFlight()

      // Second poll: NOT short-circuited — re-kicks generation.
      mockElectionApi.getRaceContext.mockResolvedValueOnce(apiCtx)
      mockStrategic.generate.mockResolvedValueOnce({
        opportunities: ['a', 'b', 'c'],
        challenges: ['x', 'y', 'z'],
        opponents: [],
      })

      const result =
        await service.getOrGenerateStrategicLandscape(buildCampaign())
      expect(result).toEqual({ status: 'generating' })

      await service.drainInFlight()
      expect(mockStrategic.generate).toHaveBeenCalledTimes(1)
    })
  })
})
