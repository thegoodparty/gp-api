import { BadGatewayException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { P2P_JOB_DEFAULTS } from '../constants/p2pJob.constants'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyP2pJobService } from './peerlyP2pJob.service'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'

describe('PeerlyP2pJobService', () => {
  let service: PeerlyP2pJobService
  let mockMediaService: { createMedia: ReturnType<typeof vi.fn> }
  let mockSmsService: {
    createJob: ReturnType<typeof vi.fn>
    assignListToJob: ReturnType<typeof vi.fn>
    requestCanvassers: ReturnType<typeof vi.fn>
    retrieveJobsListByIdentityId: ReturnType<typeof vi.fn>
    retrieveJob: ReturnType<typeof vi.fn>
  }

  const baseJobParams = {
    campaignId: 1,
    crmCompanyId: 'hub-1',
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
    mockSmsService = {
      createJob: vi.fn().mockResolvedValue('job-789'),
      assignListToJob: vi.fn().mockResolvedValue(undefined),
      requestCanvassers: vi.fn().mockResolvedValue(undefined),
      retrieveJobsListByIdentityId: vi.fn(),
      retrieveJob: vi.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeerlyP2pJobService,
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: PeerlyMediaService, useValue: mockMediaService },
        { provide: PeerlyP2pSmsService, useValue: mockSmsService },
      ],
    }).compile()

    service = module.get(PeerlyP2pJobService)
    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('createPeerlyP2pJob', () => {
    it('passes didState and didNpaSubset through to SMS service createJob', async () => {
      const jobId = await service.createPeerlyP2pJob({
        ...baseJobParams,
        didState: 'CA',
        didNpaSubset: ['619', '858'],
      })

      expect(jobId).toBe('job-789')
      expect(mockSmsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          didState: 'CA',
          didNpaSubset: ['619', '858'],
        }),
      )
    })

    it('defaults didState to P2P_JOB_DEFAULTS.DID_STATE when not provided', async () => {
      await service.createPeerlyP2pJob(baseJobParams)

      expect(mockSmsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          didState: P2P_JOB_DEFAULTS.DID_STATE,
        }),
      )
    })

    it('defaults didNpaSubset to empty array when not provided', async () => {
      await service.createPeerlyP2pJob(baseJobParams)

      expect(mockSmsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          didNpaSubset: [],
        }),
      )
    })

    it('calls media, createJob, assignList, requestCanvassers in order', async () => {
      const callOrder: string[] = []
      mockMediaService.createMedia.mockImplementation(async () => {
        callOrder.push('createMedia')
        return 'media-456'
      })
      mockSmsService.createJob.mockImplementation(async () => {
        callOrder.push('createJob')
        return 'job-789'
      })
      mockSmsService.assignListToJob.mockImplementation(async () => {
        callOrder.push('assignListToJob')
      })
      mockSmsService.requestCanvassers.mockImplementation(async () => {
        callOrder.push('requestCanvassers')
      })

      await service.createPeerlyP2pJob({
        ...baseJobParams,
        didState: 'NY',
        didNpaSubset: ['212'],
      })

      expect(callOrder).toEqual([
        'createMedia',
        'createJob',
        'assignListToJob',
        'requestCanvassers',
      ])
    })

    it('passes media ID from createMedia to createJob templates', async () => {
      mockMediaService.createMedia.mockResolvedValue('media-custom-id')

      await service.createPeerlyP2pJob(baseJobParams)

      const createJobCall = mockSmsService.createJob.mock.calls[0][0]
      expect(createJobCall.templates[0].media.media_id).toBe('media-custom-id')
    })

    it('extracts date-only from ISO scheduledDate', async () => {
      await service.createPeerlyP2pJob({
        ...baseJobParams,
        scheduledDate: '2025-03-15T14:30:00.000Z',
      })

      expect(mockSmsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledDate: '2025-03-15',
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

      expect(mockSmsService.createJob).not.toHaveBeenCalled()
      expect(mockSmsService.assignListToJob).not.toHaveBeenCalled()
    })

    it('throws BadGatewayException when job creation fails (media already created)', async () => {
      mockSmsService.createJob.mockRejectedValue(
        new Error('Job creation failed'),
      )

      await expect(service.createPeerlyP2pJob(baseJobParams)).rejects.toThrow(
        BadGatewayException,
      )

      expect(mockMediaService.createMedia).toHaveBeenCalled()
      expect(mockSmsService.assignListToJob).not.toHaveBeenCalled()
    })

    it('throws BadGatewayException when list assignment fails (job already created)', async () => {
      mockSmsService.assignListToJob.mockRejectedValue(
        new Error('List assignment failed'),
      )

      await expect(service.createPeerlyP2pJob(baseJobParams)).rejects.toThrow(
        BadGatewayException,
      )

      expect(mockSmsService.createJob).toHaveBeenCalled()
      expect(mockSmsService.requestCanvassers).not.toHaveBeenCalled()
    })
  })

  describe('getJobsByIdentityId', () => {
    it('returns jobs from SMS service', async () => {
      const mockJobs = [{ id: 'job-1' }, { id: 'job-2' }]
      mockSmsService.retrieveJobsListByIdentityId.mockResolvedValue(mockJobs)

      const result = await service.getJobsByIdentityId('identity-123')

      expect(result).toEqual(mockJobs)
      expect(mockSmsService.retrieveJobsListByIdentityId).toHaveBeenCalledWith(
        'identity-123',
      )
    })

    it('throws BadGatewayException when retrieval fails', async () => {
      mockSmsService.retrieveJobsListByIdentityId.mockRejectedValue(
        new Error('API error'),
      )

      await expect(service.getJobsByIdentityId('identity-123')).rejects.toThrow(
        BadGatewayException,
      )
    })
  })

  describe('getJob', () => {
    it('returns job from SMS service', async () => {
      const mockJob = { id: 'job-1', status: 'active' }
      mockSmsService.retrieveJob.mockResolvedValue(mockJob)

      const result = await service.getJob('job-1')

      expect(result).toEqual(mockJob)
      expect(mockSmsService.retrieveJob).toHaveBeenCalledWith('job-1')
    })

    it('throws BadGatewayException when retrieval fails', async () => {
      mockSmsService.retrieveJob.mockRejectedValue(new Error('API error'))

      await expect(service.getJob('job-1')).rejects.toThrow(BadGatewayException)
    })
  })
})
