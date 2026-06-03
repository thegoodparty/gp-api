import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmService } from '@/llm/services/llm.service'
import type { RaceNode } from '../types/ballotReady.types'
import { BallotReadyService } from './ballotReady.service'
import { CensusEntitiesService } from './censusEntities.service'
import { ElectionsService } from './elections.service'
import { RacesService } from './races.service'

describe('RacesService', () => {
  let service: RacesService
  let electionsService: {
    searchPositions: ReturnType<typeof vi.fn>
    getZipCodesByBrPositionId: ReturnType<typeof vi.fn>
  }
  let ballotReadyService: {
    fetchRaceById: ReturnType<typeof vi.fn>
    fetchRaceNormalizedPosition: ReturnType<typeof vi.fn>
    fetchRacesWithElectionDates: ReturnType<typeof vi.fn>
    fetchRaceByPositionAndDate: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    electionsService = {
      searchPositions: vi.fn(),
      getZipCodesByBrPositionId: vi.fn(),
    }
    ballotReadyService = {
      fetchRaceById: vi.fn(),
      fetchRaceNormalizedPosition: vi.fn(),
      fetchRacesWithElectionDates: vi.fn(),
      fetchRaceByPositionAndDate: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RacesService,
        { provide: PinoLogger, useValue: createMockLogger() },
        {
          provide: CensusEntitiesService,
          useValue: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
          },
        },
        {
          provide: BallotReadyService,
          useValue: ballotReadyService,
        },
        {
          provide: LlmService,
          useValue: {
            toolCompletion: vi.fn(),
          },
        },
        {
          provide: ElectionsService,
          useValue: electionsService,
        },
      ],
    }).compile()

    service = module.get<RacesService>(RacesService)

    vi.clearAllMocks()
  })

  describe('getRacesByZip', () => {
    it('returns ZipToPosition rows from election-api unchanged', async () => {
      const sampleRow = {
        id: 'ztp-1',
        brPositionId: 'br-pos-1',
        position: { name: 'Mayor', level: 'City', state: 'CA' },
        election: { electionDay: '2026-11-03' },
        city: 'Beverly Hills',
        district: null,
      }
      electionsService.searchPositions.mockResolvedValue([sampleRow])

      const result = await service.getRacesByZip({ zipcode: '90210' })

      expect(electionsService.searchPositions).toHaveBeenCalledWith(
        expect.objectContaining({
          zip: '90210',
          displayOfficeLevels: undefined,
        }),
      )
      expect(result).toEqual([sampleRow])
    })

    it('passes expanded displayOfficeLevels for level=Local', async () => {
      electionsService.searchPositions.mockResolvedValue([])
      await service.getRacesByZip({ zipcode: '90210', level: 'Local' })
      expect(electionsService.searchPositions).toHaveBeenCalledWith(
        expect.objectContaining({
          displayOfficeLevels: ['Local', 'Township'],
        }),
      )
    })

    it('uses electionDate as electionDateTo when provided', async () => {
      electionsService.searchPositions.mockResolvedValue([])
      await service.getRacesByZip({
        zipcode: '90210',
        electionDate: '2027-06-30',
      })
      expect(electionsService.searchPositions).toHaveBeenCalledWith(
        expect.objectContaining({
          electionDateTo: '2027-06-30',
        }),
      )
    })

    it('passes name through to searchPositions', async () => {
      electionsService.searchPositions.mockResolvedValue([])
      await service.getRacesByZip({ zipcode: '90210', name: 'mayor' })
      expect(electionsService.searchPositions).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'mayor' }),
      )
    })

    it('passes officeType through to searchPositions', async () => {
      electionsService.searchPositions.mockResolvedValue([])
      await service.getRacesByZip({
        zipcode: '90210',
        officeType: ['Mayor'],
      })
      expect(electionsService.searchPositions).toHaveBeenCalledWith(
        expect.objectContaining({ officeType: ['Mayor'] }),
      )
    })
  })

  describe('getRaceByPositionAndDate', () => {
    it('returns 404 when BR returns nothing', async () => {
      ballotReadyService.fetchRaceByPositionAndDate.mockResolvedValue(null)
      await expect(
        service.getRaceByPositionAndDate({
          brPositionId: 'x',
          electionDate: '2026-11-03',
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns the BR race node when found', async () => {
      const fakeNode = {
        id: 'race-1',
        isPrimary: false,
        filingPeriods: [],
        position: {
          id: 'p',
          name: 'Mayor',
          level: 'CITY',
          state: 'CA',
          partisanType: 'nonpartisan',
          hasPrimary: false,
          electionFrequencies: [{ frequency: [4] }],
          normalizedPosition: { name: 'Mayor' },
          mtfcc: null,
          geoId: null,
          subAreaName: null,
          subAreaValue: null,
          tier: null,
        },
        election: {
          id: 'e-1',
          electionDay: '2026-11-03',
          name: 'General',
          state: 'CA',
          timezone: 'America/Los_Angeles',
          primaryElectionDate: null,
          primaryElectionId: null,
        },
        city: null,
      }
      ballotReadyService.fetchRaceByPositionAndDate.mockResolvedValue(
        fakeNode as unknown as RaceNode,
      )
      const result = await service.getRaceByPositionAndDate({
        brPositionId: 'p',
        electionDate: '2026-11-03',
      })
      expect(result.id).toBe('race-1')
      expect(result.position.name).toBe('Mayor')
      expect(result.election.electionDay).toBe('2026-11-03')
    })
  })

  describe('getZipCodesByRaceId', () => {
    it('resolves raceId via BallotReady then asks election-api for zips', async () => {
      ballotReadyService.fetchRaceById.mockResolvedValue({
        node: { position: { id: 'br-pos-1' } },
      })
      electionsService.getZipCodesByBrPositionId.mockResolvedValue([
        '90210',
        '90211',
      ])

      const result = await service.getZipCodesByRaceId('race-1')

      expect(ballotReadyService.fetchRaceById).toHaveBeenCalledWith('race-1')
      expect(electionsService.getZipCodesByBrPositionId).toHaveBeenCalledWith(
        'br-pos-1',
      )
      expect(result).toEqual(['90210', '90211'])
    })

    it('throws NotFoundException when BallotReady returns no race', async () => {
      ballotReadyService.fetchRaceById.mockResolvedValue(null)

      await expect(service.getZipCodesByRaceId('race-missing')).rejects.toThrow(
        NotFoundException,
      )
      expect(electionsService.getZipCodesByBrPositionId).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when race has no position id', async () => {
      ballotReadyService.fetchRaceById.mockResolvedValue({
        node: { position: null },
      })

      await expect(service.getZipCodesByRaceId('race-1')).rejects.toThrow(
        NotFoundException,
      )
      expect(electionsService.getZipCodesByBrPositionId).not.toHaveBeenCalled()
    })
  })
})
