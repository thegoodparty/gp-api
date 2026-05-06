import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiService } from '../../ai/ai.service'
import type { RaceNode } from '../types/ballotReady.types'
import { BallotReadyService } from './ballotReady.service'
import { CensusEntitiesService } from './censusEntities.service'
import { ElectionsService } from './elections.service'
import { RacesService } from './races.service'

describe('RacesService', () => {
  let service: RacesService
  let electionsService: { getZipToPositions: ReturnType<typeof vi.fn> }
  let ballotReadyService: {
    fetchRaceById: ReturnType<typeof vi.fn>
    fetchRaceNormalizedPosition: ReturnType<typeof vi.fn>
    fetchRacesWithElectionDates: ReturnType<typeof vi.fn>
    fetchRaceByPositionAndDate: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    electionsService = {
      getZipToPositions: vi.fn(),
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
          provide: AiService,
          useValue: {
            getChatToolCompletion: vi.fn(),
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
      electionsService.getZipToPositions.mockResolvedValue([sampleRow])

      const result = await service.getRacesByZip({ zipcode: '90210' })

      expect(electionsService.getZipToPositions).toHaveBeenCalledWith(
        expect.objectContaining({
          zip: '90210',
          displayOfficeLevels: undefined,
        }),
      )
      expect(result).toEqual([sampleRow])
    })

    it('passes expanded displayOfficeLevels for level=Local', async () => {
      electionsService.getZipToPositions.mockResolvedValue([])
      await service.getRacesByZip({ zipcode: '90210', level: 'Local' })
      expect(electionsService.getZipToPositions).toHaveBeenCalledWith(
        expect.objectContaining({
          displayOfficeLevels: ['Local', 'Township', 'Village'],
        }),
      )
    })

    it('uses electionDate as electionDateTo when provided', async () => {
      electionsService.getZipToPositions.mockResolvedValue([])
      await service.getRacesByZip({
        zipcode: '90210',
        electionDate: '2027-06-30',
      })
      expect(electionsService.getZipToPositions).toHaveBeenCalledWith(
        expect.objectContaining({
          electionDateTo: '2027-06-30',
        }),
      )
    })
  })

  describe('getRaceByPositionAndDate', () => {
    it('returns 404 when BR returns nothing', async () => {
      ballotReadyService.fetchRaceByPositionAndDate.mockResolvedValue(null)
      await expect(
        service.getRaceByPositionAndDate({
          brPositionId: 'x',
          zip: '90210',
          electionDate: '2026-11-03',
        }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns the BR race node when found', async () => {
      const fakeNode = {
        id: 'race-1',
        position: { id: 'p', name: 'Mayor' },
        election: { electionDay: '2026-11-03' },
      }
      ballotReadyService.fetchRaceByPositionAndDate.mockResolvedValue(
        fakeNode as unknown as RaceNode,
      )
      const result = await service.getRaceByPositionAndDate({
        brPositionId: 'p',
        zip: '90210',
        electionDate: '2026-11-03',
      })
      expect(result.id).toBe('race-1')
    })
  })
})
