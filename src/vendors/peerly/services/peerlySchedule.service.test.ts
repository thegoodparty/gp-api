import { BadGatewayException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { P2P_SCHEDULE_DEFAULTS } from '../constants/p2pJob.constants'
import { PeerlyScheduleService } from './peerlySchedule.service'
import { PeerlyErrorHandlingService } from './peerlyErrorHandling.service'
import { PeerlyHttpService } from './peerlyHttp.service'

describe('PeerlyScheduleService', () => {
  let service: PeerlyScheduleService
  let mockHttpService: {
    post: ReturnType<typeof vi.fn>
    validateResponse: ReturnType<typeof vi.fn>
  }
  let mockErrorHandling: {
    handleApiError: ReturnType<typeof vi.fn>
  }

  const mockScheduleResponse = {
    Data: {
      schedule_id: 12345,
      schedule_name: 'GP P2P - Campaign 1 - 2026-04-15 - Test',
      account: '88889754',
    },
  }

  beforeEach(async () => {
    mockHttpService = {
      post: vi.fn().mockResolvedValue({ data: mockScheduleResponse }),
      validateResponse: vi.fn().mockImplementation((_data) => _data),
    }
    mockErrorHandling = {
      handleApiError: vi.fn().mockImplementation(() => {
        throw new BadGatewayException('mock error')
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyScheduleService,
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: PeerlyHttpService, useValue: mockHttpService },
        {
          provide: PeerlyErrorHandlingService,
          useValue: mockErrorHandling,
        },
      ],
    }).compile()

    service = module.get(PeerlyScheduleService)
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('createSchedule', () => {
    it('returns schedule_id from validated response', async () => {
      const result = await service.createSchedule('Test Schedule')

      expect(result).toBe(12345)
    })

    it('posts to /schedule with correct body structure', async () => {
      await service.createSchedule('My Schedule')

      expect(mockHttpService.post).toHaveBeenCalledWith(
        '/schedule',
        expect.objectContaining({
          schedule_name: 'My Schedule',
          schedule_timezone: P2P_SCHEDULE_DEFAULTS.TIMEZONE,
          is_global: P2P_SCHEDULE_DEFAULTS.IS_GLOBAL,
          mon_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          mon_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
          tue_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          tue_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
          wed_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          wed_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
          thu_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          thu_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
          fri_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          fri_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
          sat_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          sat_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
          sun_start: P2P_SCHEDULE_DEFAULTS.START_TIME,
          sun_end: P2P_SCHEDULE_DEFAULTS.END_TIME,
        }),
      )
    })

    it('includes account number in request body', async () => {
      await service.createSchedule('Test')

      const postCall = mockHttpService.post.mock.calls[0]
      expect(postCall[1].account).toBe(service.accountNumber)
    })

    it('throws BadGatewayException on API failure', async () => {
      mockHttpService.post.mockRejectedValue(new Error('API down'))

      await expect(service.createSchedule('Fail')).rejects.toThrow(
        BadGatewayException,
      )
    })
  })
})
