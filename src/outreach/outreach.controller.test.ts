import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { Campaign, OutreachStatus, OutreachType, User } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OutreachController } from './outreach.controller'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('OutreachController', () => {
  let controller: OutreachController
  let mockTcrComplianceService: { findFirst: ReturnType<typeof vi.fn> }
  let mockOutreachService: { create: ReturnType<typeof vi.fn> }
  let mockS3Service: {
    buildKey: ReturnType<typeof vi.fn>
    uploadFile: ReturnType<typeof vi.fn>
  }
  let mockPeerlyP2pJobService: Record<string, ReturnType<typeof vi.fn>>

  const mockUser = {
    id: 100,
    email: 'user@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
  } as User

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
    mockS3Service = {
      buildKey: vi.fn(
        (folder?: string, fileName?: string) =>
          `${folder ?? ''}/${fileName ?? ''}`,
      ),
      uploadFile: vi
        .fn()
        .mockResolvedValue('https://cdn.example.com/image.png'),
    }
    mockPeerlyP2pJobService = {}

    controller = new OutreachController(
      mockTcrComplianceService as never,
      mockOutreachService as never,
      mockS3Service as never,
      mockPeerlyP2pJobService as never,
      createMockLogger(),
    )
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('throws UnauthorizedException when campaign ID does not match DTO', async () => {
      const mismatchedDto = { ...textDto, campaignId: 999 }

      await expect(
        controller.create(
          mockUser,
          baseCampaign,
          mismatchedDto as never,
          mockImage as never,
        ),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('throws BadRequestException when text outreach has no image', async () => {
      await expect(
        controller.create(mockUser, baseCampaign, textDto as never, undefined),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(mockUser, baseCampaign, textDto as never, undefined),
      ).rejects.toThrow(/Image is required for text outreach/)
    })

    it('throws BadRequestException when P2P outreach has no image', async () => {
      await expect(
        controller.create(mockUser, baseCampaign, p2pDto as never, undefined),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(mockUser, baseCampaign, p2pDto as never, undefined),
      ).rejects.toThrow(/Image is required for p2p outreach/)
    })

    it('throws BadRequestException when P2P image is missing filename', async () => {
      const noFilenameImage = { ...mockImage, filename: undefined }

      await expect(
        controller.create(
          mockUser,
          baseCampaign,
          p2pDto as never,
          noFilenameImage as never,
        ),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(
          mockUser,
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
          mockUser,
          baseCampaign,
          p2pDto as never,
          noMimetypeImage as never,
        ),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when P2P image upload fails (no imageUrl)', async () => {
      mockS3Service.uploadFile.mockResolvedValue(undefined)

      await expect(
        controller.create(
          mockUser,
          baseCampaign,
          p2pDto as never,
          mockImage as never,
        ),
      ).rejects.toThrow(BadRequestException)
      await expect(
        controller.create(
          mockUser,
          baseCampaign,
          p2pDto as never,
          mockImage as never,
        ),
      ).rejects.toThrow(/Failed to upload image/)
    })

    it('creates text outreach with uploaded imageUrl', async () => {
      mockS3Service.uploadFile.mockResolvedValue(
        'https://cdn.example.com/uploaded.png',
      )
      mockOutreachService.create.mockResolvedValue({ id: 1, ...textDto })

      await controller.create(
        mockUser,
        baseCampaign,
        textDto as never,
        mockImage as never,
      )

      expect(mockS3Service.buildKey).toHaveBeenCalledWith(
        expect.stringContaining('scheduled-campaign/jane-doe/text/'),
        mockImage.filename,
      )
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        mockImage.data,
        expect.stringContaining('scheduled-campaign/jane-doe/text/'),
        expect.objectContaining({
          contentType: mockImage.mimetype,
          cacheControl: expect.stringContaining('max-age='),
        }),
      )
      expect(mockOutreachService.create).toHaveBeenCalledWith(
        mockUser,
        baseCampaign,
        textDto,
        'https://cdn.example.com/uploaded.png',
        undefined,
      )
    })

    it('creates P2P outreach passing p2pImage with stream, filename, mimetype', async () => {
      mockS3Service.uploadFile.mockResolvedValue(
        'https://cdn.example.com/p2p.png',
      )
      mockOutreachService.create.mockResolvedValue({ id: 2, ...p2pDto })

      await controller.create(
        mockUser,
        baseCampaign,
        p2pDto as never,
        mockImage as never,
      )

      expect(mockOutreachService.create).toHaveBeenCalledWith(
        mockUser,
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
      await controller.create(
        mockUser,
        baseCampaign,
        textDto as never,
        mockImage as never,
      )

      const createCall = mockOutreachService.create.mock.calls[0]
      // signature: (user, campaign, dto, imageUrl, p2pImage) — position 4 is p2pImage
      expect(createCall[4]).toBeUndefined()
    })

    it('creates outreach without image when outreachType does not require one', async () => {
      const emailDto = {
        ...textDto,
        outreachType: 'email' as OutreachType,
      }

      await controller.create(
        mockUser,
        baseCampaign,
        emailDto as never,
        undefined,
      )

      expect(mockS3Service.uploadFile).not.toHaveBeenCalled()
      expect(mockOutreachService.create).toHaveBeenCalledWith(
        mockUser,
        baseCampaign,
        emailDto,
        undefined,
        undefined,
      )
    })
  })
})
