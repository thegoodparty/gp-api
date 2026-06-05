import { Test, TestingModule } from '@nestjs/testing'
import { DiscoveryModule, HttpAdapterHost, Reflector } from '@nestjs/core'
import {
  HttpStatus,
  ModuleMetadata,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common'
import { DomainStatus, WebsiteStatus } from '../../generated/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebsitesController } from './websites.controller'
import { WebsitesService } from '../services/websites.service'
import { WebsiteContactsService } from '../services/websiteContacts.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
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
import { UseCampaignGuard } from 'src/campaigns/guards/UseCampaign.guard'
import { REQUIRE_CAMPAIGN_META_KEY } from 'src/campaigns/decorators/UseCampaign.decorator'
import { MCP_TOOL_KEY } from '@/mcp/decorators/McpTool.decorator'
import { McpServerService } from '@/mcp/services/mcpServer.service'
import { AgentMcpMarker } from '@/authentication/agentMcpMarker'
import { MyWebsiteResponseSchema } from '../schemas/WebsiteResponse.schema'
import { VerifyLiveResponseSchema } from '../schemas/VerifyLive.schema'

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
  let mockS3Service: {
    buildKey: ReturnType<typeof vi.fn>
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
        domain: { status: DomainStatus.submitted },
      }),
      findUnique: vi.fn(),
      getWebsiteIdByDomain: vi.fn(),
      update: vi.fn().mockResolvedValue({
        id: 1,
        content: completeContent,
      }),
    }
    mockS3Service = {
      buildKey: vi.fn(
        (folder?: string, fileName?: string) =>
          `${folder ?? ''}/${fileName ?? ''}`,
      ),
      uploadFile: vi.fn().mockResolvedValue('uploaded-file-url'),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: WebsitesService, useValue: mockWebsitesService },
        { provide: WebsiteContactsService, useValue: {} },
        { provide: S3Service, useValue: mockS3Service },
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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
      })

      const publishBody = new UpdateWebsiteSchema()
      publishBody.status = WebsiteStatus.published
      await controller.updateWebsite(mockUser, mockCampaign, publishBody)

      expect(mockAnalytics.track).toHaveBeenCalledTimes(1)

      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: true,
        domain: { status: DomainStatus.submitted },
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
      const updateResult = {
        id: 1,
        content: completeContent,
        status: 'published',
        domain: null,
      }
      mockWebsitesService.update.mockResolvedValue(updateResult)
      mockAnalytics.track.mockRejectedValue(new Error('Segment unavailable'))

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      const result = await controller.updateWebsite(
        mockUser,
        mockCampaign,
        body,
      )

      expect(result).toEqual(updateResult)
    })
  })

  describe('updateWebsite - attached-domain publish gate', () => {
    const publishBody = () => {
      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published
      return body
    }

    it('rejects publish when attached domain.status is pending', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: { status: DomainStatus.pending },
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('pending'),
      })
      expect(mockWebsitesService.update).not.toHaveBeenCalled()
    })

    it('rejects publish when attached domain.status is inactive', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: { status: DomainStatus.inactive },
      })

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, publishBody()),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it.each([
      DomainStatus.submitted,
      DomainStatus.registered,
      DomainStatus.active,
    ])('allows publish when attached domain.status is %s', async (status) => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: { status },
      })

      await controller.updateWebsite(mockUser, mockCampaign, publishBody())

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('allows publish without an attached domain (non-Pro / GP-hosted candidate site)', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: null,
      })

      await controller.updateWebsite(mockUser, mockCampaign, publishBody())

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('does not gate non-published status transitions (no domain required)', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
        domain: null,
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.unpublished

      await controller.updateWebsite(mockUser, mockCampaign, body)

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('does not gate content-only edits (no status change)', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {},
        hasEverBeenPublished: false,
        domain: null,
      })

      const body = new UpdateWebsiteSchema()
      body.about = { bio: 'autosave from candidate UI' }

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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
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
        message: expect.stringContaining('contact.email'),
      })
    })

    it('blocks publish when about.bio is blank', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          about: { ...completeContent.about, bio: '   ' },
        },
        hasEverBeenPublished: false,
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
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
        domain: { status: DomainStatus.submitted },
      })

      await controller.updateWebsite(mockUser, mockCampaign, publishBody())

      expect(mockWebsitesService.update).toHaveBeenCalled()
    })

    it('fills contact.address and contact.phone from GP_DOMAIN_CONTACT when blank, then publishes', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: {
          ...completeContent,
          contact: { email: completeContent.contact!.email },
        },
        hasEverBeenPublished: false,
        domain: { status: DomainStatus.submitted },
      })

      await controller.updateWebsite(mockUser, mockCampaign, publishBody())

      const updateCall = mockWebsitesService.update.mock.calls[0][0]
      expect(updateCall.data.content.contact.address).toBe(
        '916 Silver Spur Rd, Rolling Hills Estates, CA 90274',
      )
      expect(updateCall.data.content.contact.phone).toBe('+1.3126851162')
      expect(updateCall.data.content.contact.email).toBe(
        completeContent.contact!.email,
      )
    })

    it('does not overwrite candidate-provided contact.address or contact.phone', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: { status: DomainStatus.submitted },
      })

      await controller.updateWebsite(mockUser, mockCampaign, publishBody())

      const updateCall = mockWebsitesService.update.mock.calls[0][0]
      expect(updateCall.data.content.contact.address).toBe(
        completeContent.contact!.address,
      )
      expect(updateCall.data.content.contact.phone).toBe(
        completeContent.contact!.phone,
      )
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
        domain: { status: DomainStatus.submitted },
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      await expect(
        controller.updateWebsite(mockUser, mockCampaign, body, [
          { fieldname: 'heroFile' } as FileUpload,
        ]),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
      expect(mockWebsitesService.update).not.toHaveBeenCalled()
    })
  })

  describe('updateWebsite - file upload scoping', () => {
    it('scopes uploaded image keys to the campaign ID', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: null,
      })
      mockWebsitesService.update.mockResolvedValue({
        id: 1,
        content: completeContent,
      })
      mockS3Service.buildKey.mockImplementation(
        (folder?: string, fileName?: string) =>
          `${folder ?? ''}/${fileName ?? ''}`,
      )
      mockS3Service.uploadFile.mockResolvedValue('uploaded-file-url')

      const logoFile: FileUpload = {
        fieldname: 'logoFile',
        filename: 'logo.png',
        mimetype: 'image/png',
        encoding: '7bit',
        data: Buffer.from('logo'),
      }
      const heroFile: FileUpload = {
        fieldname: 'heroFile',
        filename: 'hero.png',
        mimetype: 'image/png',
        encoding: '7bit',
        data: Buffer.from('hero'),
      }

      const body = new UpdateWebsiteSchema()
      await controller.updateWebsite(mockUser, mockCampaign, body, [
        logoFile,
        heroFile,
      ])

      expect(mockS3Service.buildKey).toHaveBeenCalledWith(
        `uploads/${mockCampaign.id}`,
        logoFile.filename,
      )
      expect(mockS3Service.buildKey).toHaveBeenCalledWith(
        `uploads/${mockCampaign.id}`,
        heroFile.filename,
      )
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        logoFile.data,
        `uploads/${mockCampaign.id}/${logoFile.filename}`,
        expect.objectContaining({ contentType: logoFile.mimetype }),
      )
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        heroFile.data,
        `uploads/${mockCampaign.id}/${heroFile.filename}`,
        expect.objectContaining({ contentType: heroFile.mimetype }),
      )
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

  describe('verifyLive', () => {
    it('normalizes Decimal domain.price to number on GET /mine', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        campaignId: mockCampaign.id,
        status: WebsiteStatus.unpublished,
        hasEverBeenPublished: false,
        vanityPath: 'jane',
        content: completeContent,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: {
          id: 99,
          name: 'vote-jane.com',
          status: DomainStatus.submitted,
          price: new Decimal('11.25'),
          paymentId: null,
          operationId: null,
          websiteId: 1,
          emailForwardingDomainId: null,
          registrantVerifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      const result = await controller.getMyWebsite({
        id: mockCampaign.id,
      } as never)

      expect(result.domain).not.toBeNull()
      expect(typeof result.domain!.price).toBe('number')
      expect(result.domain!.price).toBe(11.25)

      const parsed = MyWebsiteResponseSchema.safeParse(result)
      expect(parsed.success).toBe(true)
    })

    it('normalizes Decimal domain.price to number on PUT /mine response', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        content: completeContent,
        hasEverBeenPublished: false,
        domain: { status: DomainStatus.submitted },
      })
      mockWebsitesService.update.mockResolvedValue({
        id: 1,
        campaignId: mockCampaign.id,
        status: WebsiteStatus.published,
        hasEverBeenPublished: true,
        vanityPath: 'jane',
        content: completeContent,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: {
          id: 99,
          name: 'vote-jane.com',
          status: DomainStatus.submitted,
          price: new Decimal('9.99'),
          paymentId: null,
          operationId: null,
          websiteId: 1,
          emailForwardingDomainId: null,
          registrantVerifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      const body = new UpdateWebsiteSchema()
      body.status = WebsiteStatus.published

      const result = await controller.updateWebsite(
        mockUser,
        mockCampaign,
        body,
      )

      expect(typeof result.domain!.price).toBe('number')
      expect(result.domain!.price).toBe(9.99)

      const parsed = MyWebsiteResponseSchema.safeParse(result)
      expect(parsed.success).toBe(true)
    })

    it('returns domain: null untouched when no domain is attached', async () => {
      mockWebsitesService.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        campaignId: mockCampaign.id,
        status: WebsiteStatus.unpublished,
        hasEverBeenPublished: false,
        vanityPath: 'jane',
        content: completeContent,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: null,
      })

      const result = await controller.getMyWebsite({
        id: mockCampaign.id,
      } as never)

      expect(result.domain).toBeNull()
    })

    it('delegates to WebsitesService.verifyLive with the calling campaign id', async () => {
      const verifyLive = vi.fn().mockResolvedValue({
        verified: true,
        url: 'https://example.com/',
        checks: {
          http_200: true,
          has_privacy_policy: true,
          has_terms: true,
          has_candidate_identity: true,
        },
      })
      ;(mockWebsitesService as { verifyLive?: typeof verifyLive }).verifyLive =
        verifyLive

      const result = await controller.verifyLive({ id: 42 } as never)

      expect(verifyLive).toHaveBeenCalledWith(42)
      expect(result.verified).toBe(true)
    })
  })

  describe('@McpTool registrations', () => {
    it('GET /mine carries @McpTool + @UseCampaign with read-only description', () => {
      const reflector = new Reflector()
      const path = Reflect.getMetadata('path', controller.getMyWebsite)
      const method = Reflect.getMetadata('method', controller.getMyWebsite)
      expect(path).toBe('mine')
      expect(method).toBe(RequestMethod.GET)

      const useCampaignMeta = reflector.get(
        REQUIRE_CAMPAIGN_META_KEY,
        controller.getMyWebsite,
      )
      expect(useCampaignMeta).toBeDefined()

      const mcpMeta = reflector.get(MCP_TOOL_KEY, controller.getMyWebsite)
      expect(mcpMeta).toBeDefined()
      expect(mcpMeta.description).toMatch(/Read the calling campaign's website/)
    })

    it('PUT /mine carries @McpTool with publish precondition in description', () => {
      const reflector = new Reflector()
      const path = Reflect.getMetadata('path', controller.updateWebsite)
      const method = Reflect.getMetadata('method', controller.updateWebsite)
      expect(path).toBe('mine')
      expect(method).toBe(RequestMethod.PUT)

      const mcpMeta = reflector.get(MCP_TOOL_KEY, controller.updateWebsite)
      expect(mcpMeta).toBeDefined()
      expect(mcpMeta.description).toMatch(/status: "published"/)
      expect(mcpMeta.description).toMatch(/submitted/)
    })

    it('POST /mine/verify-live carries @McpTool, @HttpCode(200), and @UseCampaign', () => {
      const reflector = new Reflector()
      const path = Reflect.getMetadata('path', controller.verifyLive)
      const method = Reflect.getMetadata('method', controller.verifyLive)
      expect(path).toBe('mine/verify-live')
      expect(method).toBe(RequestMethod.POST)

      const statusCode = Reflect.getMetadata(
        '__httpCode__',
        controller.verifyLive,
      )
      expect(statusCode).toBe(HttpStatus.OK)

      const useCampaignMeta = reflector.get(
        REQUIRE_CAMPAIGN_META_KEY,
        controller.verifyLive,
      )
      expect(useCampaignMeta).toBeDefined()

      const mcpMeta = reflector.get(MCP_TOOL_KEY, controller.verifyLive)
      expect(mcpMeta).toBeDefined()
      expect(mcpMeta.description).toMatch(/Single-shot fetch/)
    })
  })
})

describe('WebsitesController MCP discoverability', () => {
  const buildModule = (): ModuleMetadata => ({
    imports: [DiscoveryModule],
    controllers: [WebsitesController],
    providers: [
      McpServerService,
      AgentMcpMarker,
      { provide: PrismaService, useValue: {} },
      { provide: WebsitesService, useValue: {} },
      { provide: WebsiteContactsService, useValue: {} },
      { provide: S3Service, useValue: {} },
      { provide: WebsiteViewsService, useValue: {} },
      { provide: CampaignsService, useValue: {} },
      { provide: AnalyticsService, useValue: { track: vi.fn() } },
      { provide: ClerkUserEnricherService, useValue: {} },
      { provide: PinoLogger, useValue: createMockLogger() },
      {
        provide: HttpAdapterHost,
        useValue: {
          httpAdapter: {
            getInstance: () => ({
              inject: async () => ({
                statusCode: 200,
                body: '{}',
                headers: {},
              }),
            }),
          },
        },
      },
    ],
  })

  it('exposes GET_websites_mine, PUT_websites_mine, and POST_websites_mine_verify_live via gatherTools()', async () => {
    const moduleRef = await Test.createTestingModule(buildModule())
      .overrideGuard(UseCampaignGuard)
      .useValue({ canActivate: () => true })
      .compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()

    const getMine = tools.find((t) => t.toolName === 'GET_websites_mine')
    expect(getMine).toBeDefined()
    expect(getMine!.outputSchema).toBe(MyWebsiteResponseSchema)

    const putMine = tools.find((t) => t.toolName === 'PUT_websites_mine')
    expect(putMine).toBeDefined()
    expect(putMine!.outputSchema).toBe(MyWebsiteResponseSchema)

    const verify = tools.find(
      (t) => t.toolName === 'POST_websites_mine_verify_live',
    )
    expect(verify).toBeDefined()
    expect(verify!.outputSchema).toBe(VerifyLiveResponseSchema)
  })
})
