import { Test, TestingModule } from '@nestjs/testing'
import { HttpStatus, NotFoundException } from '@nestjs/common'
import { WebsiteStatus } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebsitesController } from './websites.controller'
import { WebsitesService } from '../services/websites.service'
import { WebsiteContactsService } from '../services/websiteContacts.service'
import { FilesService } from 'src/files/files.service'
import { FileUpload } from 'src/files/files.types'
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

const completeContent: PrismaJson.WebsiteContent = {
  main: { title: 'Smith for City Council' },
  about: {
    bio: 'A real bio.',
    issues: [{ title: 'Issue 1', description: 'Description 1' }],
  },
  contact: {
    address: '123 Main St, Springfield, IL',
    email: 'campaign@example.com',
    phone: '555-555-5555',
  },
}

describe('WebsitesController', () => {
  let controller: WebsitesController
  let mockAnalytics: {
    track: ReturnType<typeof vi.fn>
  }
  let mockFilesService: {
    uploadFile: ReturnType<typeof vi.fn>
  }
  let mockWebsitesService: {
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    getWebsiteIdByDomain: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  let mockClerkEnricher: ReturnType<typeof createMockClerkEnricher>

  beforeEach(async () => {
    mockAnalytics = {
      track: vi.fn().mockResolvedValue(undefined),
    }

    mockWebsitesService = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
      }),
      findUnique: vi.fn(),
      getWebsiteIdByDomain: vi.fn(),
      update: vi.fn().mockResolvedValue({
        id: 1,
        content: completeContent,
      }),
    }
    mockFilesService = {
      uploadFile: vi.fn().mockResolvedValue('uploaded-file-url'),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: WebsitesService, useValue: mockWebsitesService },
        { provide: WebsiteContactsService, useValue: {} },
        { provide: FilesService, useValue: mockFilesService },
        { provide: WebsiteViewsService, useValue: {} },
        { provide: CampaignsService, useValue: {} },
        { provide: AnalyticsService, useValue: mockAnalytics },
        {
          provide: ClerkUserEnricherService,
          useFactory: () => {
            mockClerkEnricher = createMockClerkEnricher()
            return mockClerkEnricher
          },
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
        content: completeContent,
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
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
      })

      const publishBody = new UpdateWebsiteSchema()
      publishBody.status = WebsiteStatus.published
      await controller.updateWebsite(mockUser, mockCampaign, publishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)

      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: true,
      })

      const unpublishBody = new UpdateWebsiteSchema()
      unpublishBody.status = WebsiteStatus.unpublished
      await controller.updateWebsite(mockUser, mockCampaign, unpublishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)

      const republishBody = new UpdateWebsiteSchema()
      republishBody.status = WebsiteStatus.published
      await controller.updateWebsite(mockUser, mockCampaign, republishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)
    })

    it('should still return the update result when analytics tracking fails', async () => {
      const expectedResult = {
        id: 1,
        content: completeContent,
        status: 'published',
      }
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

  describe('updateWebsite - domain publishing compatibility', () => {
    it('allows publishing when an attached domain is not registrant-verified', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: { registrantVerifiedAt: null, name: 'foo.com' },
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('allows publishing when the attached domain has been registrant-verified', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: {
          registrantVerifiedAt: new Date('2026-05-13T00:00:00.000Z'),
          name: 'foo.com',
        },
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('allows publishing when no custom domain is attached', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: null,
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('does not gate non-published status transitions', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
        domain: { registrantVerifiedAt: null, name: 'foo.com' },
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.unpublished

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })
  })

  describe('updateWebsite - content completeness gate', () => {
    const publishBody = () => {
      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published
      return body
    }

    it('blocks publish when no content has been authored yet', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })

      expect(mockWebsitesService.update).not.toHaveBeenCalled()
    })

    it('reports every missing required field in the error message', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('main.title'),
      })
      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        message: expect.stringContaining('about.bio'),
      })
      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        message: expect.stringContaining('contact.phone'),
      })
    })

    it('blocks publish when about.bio is blank', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          about: { ...completeContent.about, bio: '   ' },
        },
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('about.bio'),
      })
    })

    it('blocks publish when about.issues is empty', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          about: { ...completeContent.about, issues: [] },
        },
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('about.issues'),
      })
    })

    it('blocks publish when an issue is missing title or description', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          about: {
            ...completeContent.about,
            issues: [{ title: 'Solo' }],
          },
        },
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('about.issues'),
      })
    })

    it('returns bad request for malformed issues data', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          about: {
            ...completeContent.about,
            issues: [undefined as never],
          },
        },
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('about.issues'),
      })
    })

    it('blocks publish when any contact field is missing', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          contact: { ...completeContent.contact, email: undefined },
        },
        hasEverBeenPublished: false,
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('contact.email'),
      })
    })

    it('considers merged content from current state + incoming body', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          about: { ...completeContent.about, bio: '' },
        },
        hasEverBeenPublished: false,
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published
      body.about = { bio: 'Filling the missing bio in this request.' }

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('allows publish when all required fields are populated', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
      })

      await controller.updateWebsite(mockUser, mockCampaign, publishBody())

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('does not gate non-published status transitions', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.unpublished

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('does not upload files when publish validation fails', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, body, [
          { fieldname: 'heroFile' } as FileUpload,
        ]),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })

      expect(mockFilesService.uploadFile).not.toHaveBeenCalled()
      expect(mockWebsitesService.update).not.toHaveBeenCalled()
    })
  })

  describe('getWebsiteByDomain', () => {
    const domain = 'example-candidate.com'
    const websiteId = 42

    beforeEach(() => {
      mockWebsitesService.getWebsiteIdByDomain.mockResolvedValue(websiteId)
    })

    it('throws NotFoundException when website is null', async () => {
      mockWebsitesService.findUnique.mockResolvedValue(null)

      await expect(controller.getWebsiteByDomain(domain)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('throws NotFoundException when unpublished', async () => {
      mockWebsitesService.findUnique.mockResolvedValue({
        id: websiteId,
        status: WebsiteStatus.unpublished,
        content: completeContent,
      })

      await expect(controller.getWebsiteByDomain(domain)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('returns published website and enriches user', async () => {
      const mockDomainUser = {
        clerkId: 'clerk_123',
        firstName: 'Jane',
        lastName: 'Doe',
      }
      mockWebsitesService.findUnique.mockResolvedValue({
        id: websiteId,
        status: WebsiteStatus.published,
        content: completeContent,
        campaign: { user: mockDomainUser },
      })

      const result = await controller.getWebsiteByDomain(domain)

      expect(result.id).toBe(websiteId)
      expect(mockClerkEnricher.enrichUser).toHaveBeenCalledWith(mockDomainUser)
    })

    it('skips enrichment when no user', async () => {
      mockWebsitesService.findUnique.mockResolvedValue({
        id: websiteId,
        status: WebsiteStatus.published,
        content: completeContent,
        campaign: { user: null },
      })

      const result = await controller.getWebsiteByDomain(domain)

      expect(result.id).toBe(websiteId)
      expect(mockClerkEnricher.enrichUser).not.toHaveBeenCalled()
    })
  })
})
