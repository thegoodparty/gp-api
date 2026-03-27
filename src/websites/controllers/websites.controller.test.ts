import { Test, TestingModule } from '@nestjs/testing'
import { WebsiteStatus } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebsitesController } from './websites.controller'
import { WebsitesService } from '../services/websites.service'
import { WebsiteContactsService } from '../services/websiteContacts.service'
import { FilesService } from 'src/files/files.service'
import { WebsiteViewsService } from '../services/websiteViews.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { createMockClerkEnricher } from '@/shared/test-utils/mockClerkEnricher.util'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'
import {
  createMockUser,
  createMockCampaign,
} from '@/shared/test-utils/mockData.util'
import { PinoLogger } from 'nestjs-pino'
import { UpdateWebsiteSchema } from '../schemas/UpdateWebsite.schema'

const mockUser = createMockUser()
const mockCampaign = createMockCampaign({ userId: mockUser.id })

describe('WebsitesController', () => {
  let controller: WebsitesController
  let mockAnalytics: {
    track: ReturnType<typeof vi.fn>
  }
  let mockWebsitesService: {
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockAnalytics = {
      track: vi.fn().mockResolvedValue(undefined),
    }

    mockWebsitesService = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
      }),
      update: vi.fn().mockResolvedValue({ id: 1, content: {} }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: WebsitesService, useValue: mockWebsitesService },
        { provide: WebsiteContactsService, useValue: {} },
        { provide: FilesService, useValue: { uploadFile: vi.fn() } },
        { provide: WebsiteViewsService, useValue: {} },
        { provide: CampaignsService, useValue: {} },
        { provide: AnalyticsService, useValue: mockAnalytics },
        {
          provide: ClerkUserEnricherService,
          useValue: createMockClerkEnricher(),
        },
        { provide: PinoLogger, useValue: createMockLogger() },
        WebsitesController,
      ],
    }).compile()

    controller = module.get<WebsitesController>(WebsitesController)

    vi.clearAllMocks()
  })

  describe('updateWebsite - Segment event tracking', () => {
    it('should track Published event when status is set to published', async () => {
      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockAnalytics.track).toHaveBeenCalledWith(
        mockUser.id,
        EVENTS.CandidateWebsite.Published,
      )
    })

    it('should not track Published event when status is unpublished', async () => {
      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.unpublished

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should not track Published event when website has been published before', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: true,
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should not track Published event when status is not provided', async () => {
      const body = new UpdateWebsiteSchema()

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockAnalytics.track).not.toHaveBeenCalled()
    })

    it('should only fire the Published event once across publish → unpublish → republish', async () => {
      // Simulate state: starts unpublished, hasEverBeenPublished = false
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
      })

      // First publish
      const publishBody = new UpdateWebsiteSchema()
      publishBody.status = WebsiteStatus.published
      await controller.updateWebsite(mockUser, mockCampaign, publishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)

      // Unpublish
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: true,
      })

      const unpublishBody = new UpdateWebsiteSchema()
      unpublishBody.status = WebsiteStatus.unpublished
      await controller.updateWebsite(mockUser, mockCampaign, unpublishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)

      // Re-publish — should NOT fire again
      const republishBody = new UpdateWebsiteSchema()
      republishBody.status = WebsiteStatus.published
      await controller.updateWebsite(mockUser, mockCampaign, republishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)
    })

    it('should still return the update result when analytics tracking fails', async () => {
      const expectedResult = { id: 1, content: {}, status: 'published' }
      mockWebsitesService.update.mockResolvedValue(expectedResult)
      mockAnalytics.track.mockRejectedValue(new Error('Segment unavailable'))

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      const result = await controller.updateWebsite(
        mockUser,
        mockCampaign,
        body,
      )

      expect(result).toEqual(expectedResult)
    })
  })
})
