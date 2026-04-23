import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyticsService } from './analytics.service'
import { SegmentService } from 'src/vendors/segment/segment.service'
import { UsersService } from 'src/users/services/users.service'
import { PinoLogger } from 'nestjs-pino'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { runWithImpersonation } from './impersonation-context'

const mockUser = {
  id: 7,
  email: 'test@example.com',
  metaData: { hubspotId: 'hs-123' },
}

describe('AnalyticsService', () => {
  let service: AnalyticsService
  let mockSegment: { trackEvent: ReturnType<typeof vi.fn> }
  let mockUsersService: { findFirst: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    mockSegment = {
      trackEvent: vi.fn().mockResolvedValue(undefined),
    }

    mockUsersService = {
      findFirst: vi.fn().mockResolvedValue(mockUser),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: SegmentService, useValue: mockSegment },
        { provide: UsersService, useValue: mockUsersService },
        { provide: PinoLogger, useValue: createMockLogger() },
      ],
    }).compile()

    service = module.get<AnalyticsService>(AnalyticsService)

    vi.clearAllMocks()
    mockUsersService.findFirst.mockResolvedValue(mockUser)
  })

  describe('track - impersonation via AsyncLocalStorage', () => {
    it('includes impersonation: true when context is impersonating', async () => {
      await runWithImpersonation(true, async () => {
        await service.track(7, 'Test Event', { source: 'test' })
      })

      expect(mockSegment.trackEvent).toHaveBeenCalledWith(
        7,
        'Test Event',
        {
          email: 'test@example.com',
          source: 'test',
          impersonation: true,
        },
        { email: 'test@example.com', hubspotId: 'hs-123' },
      )
    })

    it('includes impersonation: false when context is not impersonating', async () => {
      await runWithImpersonation(false, async () => {
        await service.track(7, 'Test Event', { source: 'test' })
      })

      expect(mockSegment.trackEvent).toHaveBeenCalledWith(
        7,
        'Test Event',
        {
          email: 'test@example.com',
          source: 'test',
          impersonation: false,
        },
        { email: 'test@example.com', hubspotId: 'hs-123' },
      )
    })

    it('omits impersonation when no context is set', async () => {
      await service.track(7, 'Test Event', { source: 'test' })

      expect(mockSegment.trackEvent).toHaveBeenCalledWith(
        7,
        'Test Event',
        {
          email: 'test@example.com',
          source: 'test',
        },
        { email: 'test@example.com', hubspotId: 'hs-123' },
      )
    })

    it('passes user context from UsersService to segment', async () => {
      await runWithImpersonation(true, async () => {
        await service.track(7, 'Test Event', { source: 'test' })
      })

      expect(mockSegment.trackEvent).toHaveBeenCalledWith(
        7,
        'Test Event',
        expect.any(Object),
        { email: 'test@example.com', hubspotId: 'hs-123' },
      )
    })

    it('re-throws when segment tracking fails', async () => {
      const error = new Error('Segment service down')
      mockSegment.trackEvent.mockRejectedValueOnce(error)

      await expect(
        service.track(7, 'Test Event', { source: 'test' }),
      ).rejects.toThrow('Segment service down')
    })
  })

  describe('track - pre-fetched userContext', () => {
    it('skips DB lookup and uses provided userContext', async () => {
      const providedContext = {
        email: 'pre-fetched@example.com',
        hubspotId: 'hs-prefetched',
      }

      await service.track(7, 'Test Event', { source: 'test' }, providedContext)

      expect(mockUsersService.findFirst).not.toHaveBeenCalled()
      expect(mockSegment.trackEvent).toHaveBeenCalledWith(
        7,
        'Test Event',
        { email: 'pre-fetched@example.com', source: 'test' },
        providedContext,
      )
    })
  })
})
