import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { Test, TestingModule } from '@nestjs/testing'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiService } from '../../ai/ai.service'
import { BallotReadyService } from './ballotReady.service'
import { CensusEntitiesService } from './censusEntities.service'
import { ElectionsService } from './elections.service'
import { RacesService } from './races.service'

describe('RacesService', () => {
  let service: RacesService
  let electionsService: { getZipToPositions: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    electionsService = {
      getZipToPositions: vi.fn(),
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
          useValue: {
            fetchRaceById: vi.fn(),
            fetchRaceNormalizedPosition: vi.fn(),
            fetchRacesWithElectionDates: vi.fn(),
          },
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
})
