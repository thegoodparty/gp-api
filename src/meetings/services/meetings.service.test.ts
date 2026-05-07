import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { QueueProducerService } from '@/queue/producer/queueProducer.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { MeetingsService } from './meetings.service'

const mockS3Service: Partial<S3Service> = {
  uploadFile: vi.fn().mockResolvedValue('https://bucket/key'),
}

const mockOrganizationsService: Partial<OrganizationsService> = {
  findUnique: vi.fn(),
  resolveCityManifestParts: vi.fn(),
  resolvePositionContextByOrgSlug: vi.fn(),
}

const mockElectedOfficeService: Partial<ElectedOfficeService> = {
  findUnique: vi.fn(),
}

const mockQueueProducer: Partial<QueueProducerService> = {
  sendToMeetingPipelineDiscoverQueue: vi.fn().mockResolvedValue(undefined),
}

describe('MeetingsService onboarding', () => {
  let service: MeetingsService
  const electedOfficeId = '01900000-0000-7000-8000-000000000001'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockElectedOfficeService.findUnique!).mockResolvedValue({
      id: electedOfficeId,
      userId: 1,
      campaignId: 1,
      organizationSlug: `eo-${electedOfficeId}`,
    } as never)

    vi.mocked(mockOrganizationsService.findUnique!).mockResolvedValue({
      slug: `eo-${electedOfficeId}`,
      positionId: 'pos-1',
      customPositionName: null,
    } as never)

    vi.mocked(mockOrganizationsService.resolveCityManifestParts!).mockResolvedValue(
      {
        citySlug: 'chapel-hill-NC',
        city: 'Chapel Hill',
        state: 'NC',
      },
    )

    vi.mocked(
      mockOrganizationsService.resolvePositionContextByOrgSlug!,
    ).mockResolvedValue({
      ballotReadyPositionId: 'br-1',
      positionName: 'Chapel Hill Town Council Member',
    })

    service = new MeetingsService(
      mockS3Service as S3Service,
      mockOrganizationsService as OrganizationsService,
      mockElectedOfficeService as ElectedOfficeService,
      mockQueueProducer as QueueProducerService,
      createMockLogger(),
    )
  })

  describe('getOnboardingPreview', () => {
    it('returns city fields and derived expectedBody', async () => {
      const result = await service.getOnboardingPreview(electedOfficeId)

      expect(result).toEqual({
        citySlug: 'chapel-hill-NC',
        city: 'Chapel Hill',
        state: 'NC',
        expectedBody: 'Town Council',
      })
    })
  })

  describe('onboardElectedOffice', () => {
    it('uploads manifest and enqueues discover with derived body when no override', async () => {
      const result = await service.onboardElectedOffice(electedOfficeId, {})

      expect(result.citySlug).toBe('chapel-hill-NC')
      expect(result.manifestKey).toBe(
        'meeting_pipeline/sources/chapel-hill-NC/manifest.json',
      )
      expect(result.expectedBody).toBe('Town Council')

      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"expected_body": "Town Council"'),
        'meeting_pipeline/sources/chapel-hill-NC/manifest.json',
        { contentType: 'application/json' },
      )

      expect(
        mockQueueProducer.sendToMeetingPipelineDiscoverQueue,
      ).toHaveBeenCalledWith({
        slug: 'chapel-hill-NC',
        city: 'Chapel Hill',
        state: 'NC',
        reason: 'onboard',
      })
    })

    it('uses expectedBody override when provided', async () => {
      await service.onboardElectedOffice(electedOfficeId, {
        expectedBody: 'City Council',
      })

      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"expected_body": "City Council"'),
        'meeting_pipeline/sources/chapel-hill-NC/manifest.json',
        { contentType: 'application/json' },
      )
    })

    it('ignores whitespace-only override and uses derived body', async () => {
      await service.onboardElectedOffice(electedOfficeId, {
        expectedBody: '   ',
      })

      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"expected_body": "Town Council"'),
        'meeting_pipeline/sources/chapel-hill-NC/manifest.json',
        { contentType: 'application/json' },
      )
    })

    it('throws NotFoundException when elected office is missing', async () => {
      vi.mocked(mockElectedOfficeService.findUnique!).mockResolvedValue(null)

      await expect(service.onboardElectedOffice(electedOfficeId)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when organization is missing', async () => {
      vi.mocked(mockOrganizationsService.findUnique!).mockResolvedValue(null)

      await expect(service.onboardElectedOffice(electedOfficeId)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })

    it('throws UnprocessableEntityException when city cannot be resolved', async () => {
      vi.mocked(
        mockOrganizationsService.resolveCityManifestParts!,
      ).mockResolvedValue(null)

      await expect(service.onboardElectedOffice(electedOfficeId)).rejects.toThrow(
        UnprocessableEntityException,
      )
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })
  })
})
