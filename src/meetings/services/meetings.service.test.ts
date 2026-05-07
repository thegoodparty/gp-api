import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { QueueProducerService } from '@/queue/producer/queueProducer.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { PositionLevel } from 'src/generated/graphql.types'
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

const mockElectionsService: Partial<ElectionsService> = {
  getPositionById: vi.fn(),
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

    vi.mocked(
      mockOrganizationsService.resolveCityManifestParts!,
    ).mockResolvedValue({
      citySlug: 'chapel-hill-NC',
      city: 'Chapel Hill',
      state: 'NC',
    })

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
      mockElectionsService as ElectionsService,
      createMockLogger(),
    )
  })

  describe('onboardElectedOffice', () => {
    it('uploads manifest and enqueues discover with derived body', async () => {
      const result = await service.onboardElectedOffice(electedOfficeId)

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

    it('throws NotFoundException when elected office is missing', async () => {
      vi.mocked(mockElectedOfficeService.findUnique!).mockResolvedValue(null)

      await expect(
        service.onboardElectedOffice(electedOfficeId),
      ).rejects.toThrow(NotFoundException)
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when organization is missing', async () => {
      vi.mocked(mockOrganizationsService.findUnique!).mockResolvedValue(null)

      await expect(
        service.onboardElectedOffice(electedOfficeId),
      ).rejects.toThrow(NotFoundException)
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })

    it('throws UnprocessableEntityException when city cannot be resolved', async () => {
      vi.mocked(
        mockOrganizationsService.resolveCityManifestParts!,
      ).mockResolvedValue(null)

      await expect(
        service.onboardElectedOffice(electedOfficeId),
      ).rejects.toThrow(UnprocessableEntityException)
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })
  })

  describe('triggerOnboardingIfCityLevel', () => {
    const makePosition = (level: PositionLevel | null) => ({
      id: 'pos-1',
      brPositionId: 'br-pos-1',
      brDatabaseId: 'br-db-1',
      state: 'NC',
      name: 'Chapel Hill Town Council',
      level,
    })

    it('skips when org has no positionId', async () => {
      vi.mocked(mockOrganizationsService.findUnique!).mockResolvedValue({
        slug: `eo-${electedOfficeId}`,
        positionId: null,
      } as never)

      await service.triggerOnboardingIfCityLevel(electedOfficeId)

      expect(mockElectionsService.getPositionById).not.toHaveBeenCalled()
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
      expect(
        mockQueueProducer.sendToMeetingPipelineDiscoverQueue,
      ).not.toHaveBeenCalled()
    })

    it('skips when getPositionById returns null', async () => {
      vi.mocked(mockElectionsService.getPositionById!).mockResolvedValue(null)

      await service.triggerOnboardingIfCityLevel(electedOfficeId)

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
      expect(
        mockQueueProducer.sendToMeetingPipelineDiscoverQueue,
      ).not.toHaveBeenCalled()
    })

    it('skips when position.level is null', async () => {
      vi.mocked(mockElectionsService.getPositionById!).mockResolvedValue(
        makePosition(null),
      )

      await service.triggerOnboardingIfCityLevel(electedOfficeId)

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
      expect(
        mockQueueProducer.sendToMeetingPipelineDiscoverQueue,
      ).not.toHaveBeenCalled()
    })

    it.each([
      PositionLevel.COUNTY,
      PositionLevel.STATE,
      PositionLevel.FEDERAL,
      PositionLevel.LOCAL,
      PositionLevel.REGIONAL,
      PositionLevel.TOWNSHIP,
    ])('skips when position level is %s', async (level) => {
      vi.mocked(mockElectionsService.getPositionById!).mockResolvedValue(
        makePosition(level),
      )

      await service.triggerOnboardingIfCityLevel(electedOfficeId)

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
      expect(
        mockQueueProducer.sendToMeetingPipelineDiscoverQueue,
      ).not.toHaveBeenCalled()
    })

    it('onboards when position level is CITY', async () => {
      vi.mocked(mockElectionsService.getPositionById!).mockResolvedValue(
        makePosition(PositionLevel.CITY),
      )

      await service.triggerOnboardingIfCityLevel(electedOfficeId)

      expect(mockS3Service.uploadFile).toHaveBeenCalledTimes(1)
      expect(
        mockQueueProducer.sendToMeetingPipelineDiscoverQueue,
      ).toHaveBeenCalledWith({
        slug: 'chapel-hill-NC',
        city: 'Chapel Hill',
        state: 'NC',
        reason: 'onboard',
      })
    })

    it('swallows errors thrown by underlying calls', async () => {
      vi.mocked(mockOrganizationsService.findUnique!).mockRejectedValue(
        new Error('db is on fire'),
      )

      await expect(
        service.triggerOnboardingIfCityLevel(electedOfficeId),
      ).resolves.toBeUndefined()
      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
    })

    it('swallows errors from onboardElectedOffice', async () => {
      vi.mocked(mockElectionsService.getPositionById!).mockResolvedValue(
        makePosition(PositionLevel.CITY),
      )
      vi.mocked(mockS3Service.uploadFile!).mockRejectedValue(
        new Error('s3 is sad'),
      )

      await expect(
        service.triggerOnboardingIfCityLevel(electedOfficeId),
      ).resolves.toBeUndefined()
    })
  })
})
