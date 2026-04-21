import { BadGatewayException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { P2P_JOB_DEFAULTS } from '../constants/p2pJob.constants'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyP2pJobService } from './peerlyP2pJob.service'
import { PeerlyScheduleService } from './peerlySchedule.service'
import { PeerlyErrorHandlingService } from './peerlyErrorHandling.service'
import { PeerlyHttpService } from './peerlyHttp.service'

describe('PeerlyP2pJobService', () => {
  let service: PeerlyP2pJobService
  let mockMediaService: { createMedia: ReturnType<typeof vi.fn> }
  let mockScheduleService: { createSchedule: ReturnType<typeof vi.fn> }
  let mockHttpService: {
    post: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    validateResponse: ReturnType<typeof vi.fn>
  }
  let mockErrorHandling: {
    handleApiError: ReturnType<typeof vi.fn>
  }

  const baseJobParams = {
    campaignId: 1,
    listId: 100,
    imageInfo: {
      fileStream: Buffer.from('fake-image'),
      fileName: 'image.png',
      mimeType: 'image/png',
      title: 'Test Image',
    },
    scriptText: 'Hello {first_name}',
    identityId: 'identity-123',
    name: 'test-campaign - 02/01/2025',
  }

  beforeEach(async () => {
    mockMediaService = {
      createMedia: vi.fn().mockResolvedValue('media-456'),
    }
    mockScheduleService = {
      createSchedule: vi.fn().mockResolvedValue(99999),
    }
    mockHttpService = {
      post: vi.fn(),
      get: vi.fn(),
      validateResponse: vi
        .fn()
        .mockImplementation((_data, _dto, _ctx) => _data),
    }
    mockErrorHandling = {
      handleApiError: vi.fn().mockImplementation(() => {
        throw new BadGatewayException('mock error')
      }),
    }

    mockHttpService.post.mockImplementation((path: string) => {
      if (
        path.includes('/1to1/jobs') &&
        !path.includes('assignlist') &&
        !path.includes('request_canvassers')
      ) {
        return Promise.resolve({ data: { id: 'job-789' }, headers: {} })
      }
      return Promise.resolve({ data: {} })
    })
    mockHttpService.get.mockResolvedValue({ data: [] })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyP2pJobService,
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: PeerlyMediaService, useValue: mockMediaService },
        { provide: PeerlyScheduleService, useValue: mockScheduleService },
        { provide: PeerlyHttpService, useValue: mockHttpService },
        {
          provide: PeerlyErrorHandlingService,
          useValue: mockErrorHandling,
        },
      ],
    }).compile()

    service = module.get(PeerlyP2pJobService)
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('createPeerlyP2pJob', () => {
    it('passes didState and didNpaSubset through to the job creation POST', async () => {
      const jobId = await service.createPeerlyP2pJob({
        ...baseJobParams,
        didState: 'CA',
        didNpaSubset: ['619', '858'],
      })

      expect(jobId).toBe('job-789')
      const jobPostCall = mockHttpService.post.mock.calls.find(
        (c) => c[0] === '/1to1/jobs',
      )
      expect(jobPostCall).toBeDefined()
      expect(jobPostCall![1]).toEqual(
        expect.objectContaining({
          did_state: 'CA',
          did_npa_subset: ['619', '858'],
        }),
      )
    })

    it('defaults didState to P2P_JOB_DEFAULTS.DID_STATE when not provided', async () => {
      await service.createPeerlyP2pJob(baseJobParams)

      const jobPostCall = mockHttpService.post.mock.calls.find(
        (c) => c[0] === '/1to1/jobs',
      )
      expect(jobPostCall).toBeDefined()
      expect(jobPostCall![1]).toEqual(
        expect.objectContaining({
          did_state: P2P_JOB_DEFAULTS.DID_STATE,
        }),
      )
    })

    it('defaults didNpaSubset to empty array when not provided', async () => {
      await service.createPeerlyP2pJob(baseJobParams)

      const jobPostCall = mockHttpService.post.mock.calls.find(
        (c) => c[0] === '/1to1/jobs',
      )
      expect(jobPostCall).toBeDefined()
      expect(jobPostCall![1]).not.toHaveProperty('did_npa_subset')
    })

    it('calls media, createSchedule, createJob, assignList in order', async () => {
      const callOrder: string[] = []
      mockMediaService.createMedia.mockImplementation(async () => {
        callOrder.push('createMedia')
        return 'media-456'
      })
      mockScheduleService.createSchedule.mockImplementation(async () => {
        callOrder.push('createSchedule')
        return 99999
      })
      mockHttpService.post.mockImplementation(async (path: string) => {
        if (
          path.includes('/1to1/jobs') &&
          !path.includes('assignlist') &&
          !path.includes('request_canvassers')
        ) {
          callOrder.push('createJob')
          return { data: { id: 'job-789' }, headers: {} }
        }
        if (path.includes('assignlist')) {
          callOrder.push('assignListToJob')
          return { data: {} }
        }
        return { data: {} }
      })

      await service.createPeerlyP2pJob({
        ...baseJobParams,
        didState: 'NY',
        didNpaSubset: ['212'],
      })

      expect(callOrder).toEqual([
        'createMedia',
        'createSchedule',
        'createJob',
        'assignListToJob',
      ])
    })

    it('uses dynamic schedule_id from createSchedule in job creation', async () => {
      mockScheduleService.createSchedule.mockResolvedValue(77777)

      await service.createPeerlyP2pJob(baseJobParams)

      const jobPostCall = mockHttpService.post.mock.calls.find(
        (c) => c[0] === '/1to1/jobs',
      )
      expect(jobPostCall).toBeDefined()
      expect(jobPostCall![1]).toEqual(
        expect.objectContaining({ schedule_id: 77777 }),
      )
    })

    it('fails job creation when createSchedule rejects', async () => {
      mockScheduleService.createSchedule.mockRejectedValue(
        new BadGatewayException('Schedule API down'),
      )

      await expect(service.createPeerlyP2pJob(baseJobParams)).rejects.toThrow(
        BadGatewayException,
      )

      expect(mockMediaService.createMedia).toHaveBeenCalled()
      expect(
        mockHttpService.post.mock.calls.some((c) => c[0] === '/1to1/jobs'),
      ).toBe(false)
    })

    it('passes media ID from createMedia to createJob templates', async () => {
      mockMediaService.createMedia.mockResolvedValue('media-custom-id')

      await service.createPeerlyP2pJob(baseJobParams)

      const jobPostCall = mockHttpService.post.mock.calls.find(
        (c) => c[0] === '/1to1/jobs',
      )
      expect(jobPostCall).toBeDefined()
      expect(jobPostCall![1].templates[0].media.media_id).toBe(
        'media-custom-id',
      )
    })

    it('extracts date-only from ISO scheduledDate', async () => {
      await service.createPeerlyP2pJob({
        ...baseJobParams,
        scheduledDate: '2025-03-15T14:30:00.000Z',
      })

      const jobPostCall = mockHttpService.post.mock.calls.find(
        (c) => c[0] === '/1to1/jobs',
      )
      expect(jobPostCall).toBeDefined()
      expect(jobPostCall![1]).toEqual(
        expect.objectContaining({
          start_date: '2025-03-15',
          end_date: '2025-03-15',
        }),
      )
    })

    it('throws BadGatewayException when media creation fails', async () => {
      mockMediaService.createMedia.mockRejectedValue(
        new Error('Media upload failed'),
      )

      await expect(service.createPeerlyP2pJob(baseJobParams)).rejects.toThrow(
        BadGatewayException,
      )

      expect(mockHttpService.post).not.toHaveBeenCalled()
    })

    it('throws BadGatewayException when job creation fails (media already created)', async () => {
      mockHttpService.post.mockRejectedValue(new Error('Job creation failed'))

      await expect(service.createPeerlyP2pJob(baseJobParams)).rejects.toThrow(
        BadGatewayException,
      )

      expect(mockMediaService.createMedia).toHaveBeenCalled()
      expect(
        mockHttpService.post.mock.calls.some(
          (c) => typeof c[0] === 'string' && c[0].includes('assignlist'),
        ),
      ).toBe(false)
    })

    it('throws BadGatewayException when list assignment fails (job already created)', async () => {
      mockHttpService.post.mockImplementation((path: string) => {
        if (path.includes('assignlist')) {
          return Promise.reject(new Error('List assignment failed'))
        }
        if (
          path.includes('/1to1/jobs') &&
          !path.includes('request_canvassers')
        ) {
          return Promise.resolve({ data: { id: 'job-789' }, headers: {} })
        }
        return Promise.resolve({ data: {} })
      })

      await expect(service.createPeerlyP2pJob(baseJobParams)).rejects.toThrow(
        BadGatewayException,
      )

      expect(
        mockHttpService.post.mock.calls.some((c) => c[0] === '/1to1/jobs'),
      ).toBe(true)
      expect(
        mockHttpService.post.mock.calls.some(
          (c) =>
            typeof c[0] === 'string' && c[0].includes('request_canvassers'),
        ),
      ).toBe(false)
    })
  })

  describe('getJobsByIdentityId', () => {
    it('returns jobs from HTTP service', async () => {
      const mockJobs = [{ id: 'job-1' }, { id: 'job-2' }]
      mockHttpService.get.mockResolvedValue({ data: mockJobs })

      const result = await service.getJobsByIdentityId('identity-123')

      expect(result).toEqual(mockJobs)
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining('identity-123'),
      )
    })

    it('throws BadGatewayException when retrieval fails', async () => {
      mockHttpService.get.mockRejectedValue(new Error('API error'))

      await expect(service.getJobsByIdentityId('identity-123')).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  describe('getJob', () => {
    it('returns job from HTTP service', async () => {
      const mockJob = { id: 'job-1', status: 'active' }
      mockHttpService.get.mockResolvedValue({ data: mockJob })

      const result = await service.getJob('job-1')

      expect(result).toEqual(mockJob)
      expect(mockHttpService.get).toHaveBeenCalledWith('/1to1/jobs/job-1')
    })

    it('throws BadGatewayException when retrieval fails', async () => {
      mockHttpService.get.mockRejectedValue(new Error('API error'))

      await expect(service.getJob('job-1')).rejects.toThrow(BadGatewayException)
    })
  })
})
