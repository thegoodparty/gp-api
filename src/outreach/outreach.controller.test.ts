import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { Campaign, OutreachStatus, OutreachType } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OutreachController } from './outreach.controller'

describe('OutreachController', () => {
  let controller: OutreachController
  let mockTcrComplianceService: { findFirst: ReturnType<typeof vi.fn> }
  let mockOutreachService: { create: ReturnType<typeof vi.fn> }
  let mockFilesService: { uploadFile: ReturnType<typeof vi.fn> }
  let mockPeerlyP2pJobService: Record<string, ReturnType<typeof vi.fn>>

  const baseCampaign = {
    id: 1,
    slug: 'jane-doe',
    aiContent: {},
    data: {},
  } as Campaign

  const textDto = {
    campaignId: 1,
    outreachType: OutreachType.text,
    status: OutreachStatus.pending,
    date: '2025-02-01T12:00:00.000Z',
  }

  const p2pDto = {
    campaignId: 1,
    outreachType: OutreachType.p2p,
    status: OutreachStatus.pending,
    date: '2025-02-01T12:00:00.000Z',
    script: 'smsKey',
    phoneListId: 100,
    title: 'P2P Title',
  }

  const mockImage = {
    data: Buffer.from('fake-image'),
    filename: 'image.png',
    mimetype: 'image/png',
    encoding: '7bit',
    fieldname: 'file',
  }

  beforeEach(() => {
    mockTcrComplianceService = { findFirst: vi.fn() }
    mockOutreachService = {
      create: vi.fn().mockResolvedValue({ id: 1 }),
    }
    mockFilesService = {
      uploadFile: vi
        .fn()
        .mockResolvedValue('https://cdn.example.com/image.png'),
    }
    mockPeerlyP2pJobService = {}

    controller = new OutreachController(
      mockTcrComplianceService as never,
      mockOutreachService as never,
      mockFilesService as never,
      mockPeerlyP2pJobService as never,
    )
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('throws UnauthorizedException when campaign ID does not match DTO', async () => {
      const mismatchedDto = { ...textDto, campaignId: 999 }

      await expect(
        controller.create(baseCampaign, mismatchedDto as never, mockImage as never),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws BadRequestException when text outreach has no image', async () => {
      await expect(
        controller.create(baseCampaign, textDto as never, undefined),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(baseCampaign, textDto as never, undefined),
      ).rejects.toThrow(/Image is required for text outreach/)
    })

    it('throws BadRequestException when P2P outreach has no image', async () => {
      await expect(
        controller.create(baseCampaign, p2pDto as never, undefined),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(baseCampaign, p2pDto as never, undefined),
      ).rejects.toThrow(/Image is required for p2p outreach/)
    })

    it('throws BadRequestException when P2P image is missing filename', async () => {
      const noFilenameImage = { ...mockImage, filename: undefined }

      await expect(
        controller.create(
          baseCampaign,
          p2pDto as never,
          noFilenameImage as never,
        ),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(
          baseCampaign,
          p2pDto as never,
          noFilenameImage as never,
        ),
      ).rejects.toThrow(/filename and MIME type are required/)
    })

    it('throws BadRequestException when P2P image is missing mimetype', async () => {
      const noMimetypeImage = { ...mockImage, mimetype: undefined }

      await expect(
        controller.create(
          baseCampaign,
          p2pDto as never,
          noMimetypeImage as never,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when P2P image upload fails (no imageUrl)', async () => {
      mockFilesService.uploadFile.mockResolvedValue(undefined)

      await expect(
        controller.create(baseCampaign, p2pDto as never, mockImage as never),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(baseCampaign, p2pDto as never, mockImage as never),
      ).rejects.toThrow(/Failed to upload image/)
    })

    it('creates text outreach with uploaded imageUrl', async () => {
      mockFilesService.uploadFile.mockResolvedValue(
        'https://cdn.example.com/uploaded.png',
      )
      mockOutreachService.create.mockResolvedValue({ id: 1, ...textDto })

      await controller.create(baseCampaign, textDto as never, mockImage as never)

      expect(mockFilesService.uploadFile).toHaveBeenCalledWith(
        mockImage,
        expect.stringContaining('scheduled-campaign/jane-doe/text/'),
      )
      expect(mockOutreachService.create).toHaveBeenCalledWith(
        baseCampaign,
        textDto,
        'https://cdn.example.com/uploaded.png',
        undefined, // no p2pImage for text outreach
      )
    })

    it('creates P2P outreach passing p2pImage with stream, filename, mimetype', async () => {
      mockFilesService.uploadFile.mockResolvedValue(
        'https://cdn.example.com/p2p.png',
      )
      mockOutreachService.create.mockResolvedValue({ id: 2, ...p2pDto })

      await controller.create(baseCampaign, p2pDto as never, mockImage as never)

      expect(mockOutreachService.create).toHaveBeenCalledWith(
        baseCampaign,
        p2pDto,
        'https://cdn.example.com/p2p.png',
        {
          stream: mockImage.data,
          filename: mockImage.filename,
          mimetype: mockImage.mimetype,
        },
      )
    })

    it('does not pass p2pImage for non-P2P outreach types', async () => {
      await controller.create(baseCampaign, textDto as never, mockImage as never)

      const createCall = mockOutreachService.create.mock.calls[0]
      expect(createCall[3]).toBeUndefined() // p2pImage arg
    })

    it('creates outreach without image when outreachType does not require one', async () => {
      const emailDto = {
        ...textDto,
        outreachType: 'email' as OutreachType,
      }

      await controller.create(baseCampaign, emailDto as never, undefined)

      expect(mockFilesService.uploadFile).not.toHaveBeenCalled()
      expect(mockOutreachService.create).toHaveBeenCalledWith(
        baseCampaign,
        emailDto,
        undefined,
        undefined,
      )
    })
  })
})
