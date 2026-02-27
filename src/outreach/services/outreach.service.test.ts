import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { PinoLogger } from 'nestjs-pino'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Campaign, OutreachStatus, OutreachType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AreaCodeFromZipService } from 'src/ai/util/areaCodeFromZip.util'
import { CampaignTcrComplianceService } from 'src/campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { GooglePlacesService } from 'src/vendors/google/services/google-places.service'
import { PeerlyP2pJobService } from 'src/vendors/peerly/services/peerlyP2pJob.service'
import type {
  CampaignGeographyInput,
  ResolveP2pJobGeographyServices,
} from '../util/campaignGeography.util'
import type { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import { OutreachService, type P2pOutreachImageInput } from './outreach.service'

const mockOutreachCreate = vi.fn()
const mockOutreachFindMany = vi.fn()

const mockTcrFindFirstOrThrow = vi.fn()
const mockPeerlyCreateJob = vi.fn()
const mockResolveP2pJobGeography = vi.fn()

vi.mock('../util/campaignGeography.util', () => ({
  resolveP2pJobGeography: (
    campaign: CampaignGeographyInput,
    services: ResolveP2pJobGeographyServices,
  ) => mockResolveP2pJobGeography(campaign, services),
}))

describe('OutreachService', () => {
  let service: OutreachService

  const mockCampaign = {
    id: 1,
    slug: 'jane-doe',
    aiContent: {},
    data: { hubspotId: 'hub-1' },
    details: null,
  } as unknown as Campaign

  const baseCreateDto: CreateOutreachSchema = {
    campaignId: 1,
    outreachType: OutreachType.text,
    status: OutreachStatus.pending,
    date: '2025-02-01T12:00:00.000Z',
  }

  const p2pCreateDto: CreateOutreachSchema = {
    ...baseCreateDto,
    outreachType: OutreachType.p2p,
    script: 'smsKey',
    phoneListId: 100,
    title: 'P2P Title',
  }

  const p2pImage: P2pOutreachImageInput = {
    stream: Buffer.from('fake-image'),
    filename: 'image.png',
    mimetype: 'image/png',
  }

  beforeEach(async () => {
    mockOutreachCreate.mockReset()
    mockOutreachFindMany.mockReset()
    mockTcrFindFirstOrThrow.mockReset()
    mockPeerlyCreateJob.mockReset()
    mockResolveP2pJobGeography.mockReset()

    const mockPrismaService = {
      outreach: {
        create: mockOutreachCreate,
        findMany: mockOutreachFindMany,
        findFirst: vi.fn(),
        findFirstOrThrow: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        count: vi.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: PinoLogger, useValue: createMockLogger() },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GooglePlacesService, useValue: {} },
        { provide: AreaCodeFromZipService, useValue: {} },
        {
          provide: CampaignTcrComplianceService,
          useValue: { findFirstOrThrow: mockTcrFindFirstOrThrow },
        },
        {
          provide: PeerlyP2pJobService,
          useValue: { createPeerlyP2pJob: mockPeerlyCreateJob },
        },
        OutreachService,
      ],
    }).compile()

    await module.init()
    service = module.get(OutreachService)

    Object.defineProperty(service, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
  })

  describe('create', () => {
    it('creates non-P2P outreach via createRecord when p2pImage is not provided', async () => {
      const imageUrl = 'https://cdn.example.com/image.png'
      const created = {
        id: 1,
        ...baseCreateDto,
        imageUrl,
        voterFileFilter: null,
      }
      mockOutreachCreate.mockResolvedValue(created)

      const result = await service.create(
        mockCampaign,
        baseCreateDto,
        imageUrl,
        undefined,
      )

      expect(mockOutreachCreate).toHaveBeenCalledTimes(1)
      expect(mockOutreachCreate).toHaveBeenCalledWith({
        data: { ...baseCreateDto, imageUrl },
        include: { voterFileFilter: true },
      })
      expect(result).toEqual(created)
    })

    it('creates non-P2P outreach without imageUrl when both omitted', async () => {
      const created = { id: 1, ...baseCreateDto, voterFileFilter: null }
      mockOutreachCreate.mockResolvedValue(created)

      await service.create(mockCampaign, baseCreateDto, undefined, undefined)

      expect(mockOutreachCreate).toHaveBeenCalledWith({
        data: baseCreateDto,
        include: { voterFileFilter: true },
      })
    })

    it('runs P2P flow and createRecord when p2pImage and imageUrl are provided', async () => {
      mockTcrFindFirstOrThrow.mockResolvedValue({
        peerlyIdentityId: 'identity-123',
      })
      mockResolveP2pJobGeography.mockResolvedValue({
        didState: 'CA',
        didNpaSubset: ['415', '510'],
      })
      mockPeerlyCreateJob.mockResolvedValue('job-id-456')
      const created = {
        id: 2,
        ...p2pCreateDto,
        projectId: 'job-id-456',
        script: 'Resolved script text',
        status: OutreachStatus.in_progress,
        didState: 'CA',
        didNpaSubset: ['415', '510'],
        imageUrl: 'https://cdn.example.com/p2p.png',
        voterFileFilter: null,
      }
      mockOutreachCreate.mockResolvedValue(created)

      const result = await service.create(
        mockCampaign,
        p2pCreateDto,
        'https://cdn.example.com/p2p.png',
        p2pImage,
      )

      expect(mockTcrFindFirstOrThrow).toHaveBeenCalledWith({
        where: { campaignId: mockCampaign.id },
      })
      expect(mockResolveP2pJobGeography).toHaveBeenCalledWith(
        mockCampaign,
        expect.objectContaining({
          placesService: expect.anything(),
          areaCodeFromZipService: expect.anything(),
        }),
      )
      expect(mockPeerlyCreateJob).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: mockCampaign.id,
          listId: p2pCreateDto.phoneListId,
          identityId: 'identity-123',
          didState: 'CA',
          didNpaSubset: ['415', '510'],
          imageInfo: {
            fileStream: p2pImage.stream,
            fileName: p2pImage.filename,
            mimeType: p2pImage.mimetype,
            title: p2pCreateDto.title,
          },
        }),
      )
      expect(mockOutreachCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ...p2pCreateDto,
          projectId: 'job-id-456',
          status: OutreachStatus.in_progress,
          didState: 'CA',
          didNpaSubset: ['415', '510'],
          imageUrl: 'https://cdn.example.com/p2p.png',
        }),
        include: { voterFileFilter: true },
      })
      expect(result).toEqual(created)
    })

    it('throws BadRequest when P2P flow has no peerlyIdentityId', async () => {
      mockTcrFindFirstOrThrow.mockResolvedValue({ peerlyIdentityId: null })

      await expect(
        service.create(
          mockCampaign,
          p2pCreateDto,
          'https://cdn.example.com/p2p.png',
          p2pImage,
        ),
      ).rejects.toThrow(BadRequestException)

      expect(mockPeerlyCreateJob).not.toHaveBeenCalled()
      expect(mockOutreachCreate).not.toHaveBeenCalled()
    })

    it('throws BadRequest when P2P is requested without imageUrl or p2pImage', async () => {
      await expect(
        service.create(mockCampaign, p2pCreateDto, undefined, p2pImage),
      ).rejects.toThrow(BadRequestException)
      await expect(
        service.create(mockCampaign, p2pCreateDto, undefined, p2pImage),
      ).rejects.toThrow(/required for P2P outreach/)

      await expect(
        service.create(
          mockCampaign,
          p2pCreateDto,
          'https://cdn.example.com/p2p.png',
          undefined,
        ),
      ).rejects.toThrow(BadRequestException)
      await expect(
        service.create(
          mockCampaign,
          p2pCreateDto,
          'https://cdn.example.com/p2p.png',
          undefined,
        ),
      ).rejects.toThrow(/filename and MIME type|Peerly job setup/)

      expect(mockTcrFindFirstOrThrow).not.toHaveBeenCalled()
      expect(mockOutreachCreate).not.toHaveBeenCalled()
    })

    it('wraps P2P errors in BadRequest with message', async () => {
      mockTcrFindFirstOrThrow.mockRejectedValue(new Error('TCR not found'))

      await expect(
        service.create(
          mockCampaign,
          p2pCreateDto,
          'https://cdn.example.com/p2p.png',
          p2pImage,
        ),
      ).rejects.toThrow(BadRequestException)

      await expect(
        service.create(
          mockCampaign,
          p2pCreateDto,
          'https://cdn.example.com/p2p.png',
          p2pImage,
        ),
      ).rejects.toThrow(/Failed to create P2P outreach/)
    })
  })

  describe('findByCampaignId', () => {
    it('returns outreach list when campaign has outreaches', async () => {
      const list = [
        { id: 1, campaignId: 1, voterFileFilter: null },
        { id: 2, campaignId: 1, voterFileFilter: null },
      ]
      mockOutreachFindMany.mockResolvedValue(list)

      const result = await service.findByCampaignId(1)

      expect(mockOutreachFindMany).toHaveBeenCalledWith({
        where: { campaignId: 1 },
        include: { voterFileFilter: true },
      })
      expect(result).toEqual(list)
    })

    it('throws NotFoundException when no outreaches exist for campaign', async () => {
      mockOutreachFindMany.mockResolvedValue([])

      await expect(service.findByCampaignId(999)).rejects.toThrow(
        NotFoundException,
      )
      await expect(service.findByCampaignId(999)).rejects.toThrow(
        /No outreach campaigns found for campaign ID 999/,
      )
    })
  })
})
