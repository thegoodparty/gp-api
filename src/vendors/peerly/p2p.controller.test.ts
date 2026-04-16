import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadGatewayException } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { P2pController } from './p2p.controller'
import { PhoneListState } from './peerly.types'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'

const mockCampaign: Campaign = {
  id: 1,
  userId: 1,
  slug: 'test-campaign',
  organizationSlug: 'campaign-1',
  isActive: true,
  isPro: false,
  isDemo: false,
  isVerified: false,
  didWin: null,
  dateVerified: null,
  tier: null,
  formattedAddress: null,
  placeId: null,
  aiContent: {},
  vendorTsData: {},
  canDownloadFederal: false,
  completedTaskIds: [],
  hasFreeTextsOffer: false,
  freeTextsOfferRedeemedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  data: {},
  details: { state: 'CA', electionDate: '2026-11-03' },
}

function createMockReply(): FastifyReply {
  return { status: vi.fn().mockReturnThis() } as unknown as FastifyReply
}

describe('P2pController', () => {
  let controller: P2pController
  let mockPeerlyPhoneListService: {
    checkPhoneListStatus: ReturnType<typeof vi.fn>
    getPhoneListDetails: ReturnType<typeof vi.fn>
  }
  let mockP2pPhoneListUploadService: {
    uploadPhoneList: ReturnType<typeof vi.fn>
  }
  let mockOrganizationsService: {
    getDistrictForOrgSlug: ReturnType<typeof vi.fn>
  }
  let mockRes: FastifyReply

  beforeEach(() => {
    mockPeerlyPhoneListService = {
      checkPhoneListStatus: vi.fn(),
      getPhoneListDetails: vi.fn(),
    }
    mockP2pPhoneListUploadService = {
      uploadPhoneList: vi.fn(),
    }
    mockOrganizationsService = {
      getDistrictForOrgSlug: vi.fn().mockResolvedValue(null),
    }
    mockRes = createMockReply()
    controller = new P2pController(
      mockPeerlyPhoneListService as unknown as PeerlyPhoneListService,
      mockP2pPhoneListUploadService as unknown as P2pPhoneListUploadService,
      mockOrganizationsService as never,
      createMockLogger(),
    )
  })

  describe('checkPhoneListStatus', () => {
    it('returns 202 with message when service returns null (transient error)', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockResolvedValue(null)

      const result = await controller.checkPhoneListStatus(
        'test-token',
        mockRes,
      )

      expect(mockRes.status).toHaveBeenCalledWith(202)
      expect(result).toEqual({
        message: 'Phone list status is not yet available. Please try again.',
      })
    })

    it('returns 202 with message when list_state is PROCESSING', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockResolvedValue({
        Data: { list_state: PhoneListState.PROCESSING },
      })

      const result = await controller.checkPhoneListStatus(
        'test-token',
        mockRes,
      )

      expect(mockRes.status).toHaveBeenCalledWith(202)
      expect(result).toEqual({
        message:
          'Phone list is still processing. Please try again in a few moments.',
      })
    })

    it('returns 202 with message when list_state is PENDING', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockResolvedValue({
        Data: { list_state: PhoneListState.PENDING },
      })

      const result = await controller.checkPhoneListStatus(
        'test-token',
        mockRes,
      )

      expect(mockRes.status).toHaveBeenCalledWith(202)
      expect(result).toEqual({
        message: 'Phone list is not ready. Current status: PENDING',
      })
    })

    it('returns 202 with unknown status when list_state is missing', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockResolvedValue({
        Data: {},
      })

      const result = await controller.checkPhoneListStatus(
        'test-token',
        mockRes,
      )

      expect(mockRes.status).toHaveBeenCalledWith(202)
      expect(result).toEqual({
        message: 'Phone list is not ready. Current status: unknown',
      })
    })

    it('throws BadGatewayException when list_state is ACTIVE but list_id is missing', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockResolvedValue({
        Data: { list_state: PhoneListState.ACTIVE },
      })

      await expect(
        controller.checkPhoneListStatus('test-token', mockRes),
      ).rejects.toThrow(BadGatewayException)
      await expect(
        controller.checkPhoneListStatus('test-token', mockRes),
      ).rejects.toMatchObject({
        message: 'Phone list is active but no list_id was returned',
      })
    })

    it('wraps unexpected errors in BadGatewayException', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockRejectedValue(new Error('Unexpected failure'))

      await expect(
        controller.checkPhoneListStatus('test-token', mockRes),
      ).rejects.toThrow(BadGatewayException)
      await expect(
        controller.checkPhoneListStatus('test-token', mockRes),
      ).rejects.toMatchObject({
        message: 'Failed to check phone list status.',
      })
    })

    it('returns phoneListId and leadsLoaded when list is ACTIVE with list_id', async () => {
      vi.mocked(
        mockPeerlyPhoneListService.checkPhoneListStatus,
      ).mockResolvedValue({
        Data: { list_state: PhoneListState.ACTIVE, list_id: 123 },
      })
      vi.mocked(
        mockPeerlyPhoneListService.getPhoneListDetails,
      ).mockResolvedValue({
        leads_loaded: 500,
        leads_duplicate: 10,
        leads_master_dnc: 5,
        leads_cell_dnc: 2,
        leads_malformed: 3,
        use_nat_dnc: 1,
        suppress_cell_phones: 1,
        account_id: 'acc-123',
        leads_acct_dnc: 0,
        list_name: 'Test List',
        list_state: PhoneListState.ACTIVE,
        list_id: 123,
        leads_cell_suppressed: 0,
        leads_supplied: 520,
        leads_invalid: 0,
        leads_nat_dnc: 0,
        upload_by: 'user',
        shared: 0,
        upload_date: '2025-01-01',
      })

      const result = await controller.checkPhoneListStatus(
        'test-token',
        mockRes,
      )

      expect(result).toEqual({ phoneListId: 123, leadsLoaded: 500 })
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(
        mockPeerlyPhoneListService.getPhoneListDetails,
      ).toHaveBeenCalledWith(123)
    })
  })

  describe('uploadPhoneList', () => {
    it('returns token on successful upload', async () => {
      vi.mocked(
        mockP2pPhoneListUploadService.uploadPhoneList,
      ).mockResolvedValue({
        token: 'upload-token-123',
        listName: 'My List',
      })

      const result = await controller.uploadPhoneList(mockCampaign, {
        name: 'My List',
      })

      expect(result).toEqual({ token: 'upload-token-123' })
    })

    it('throws BadGatewayException when upload fails', async () => {
      vi.mocked(
        mockP2pPhoneListUploadService.uploadPhoneList,
      ).mockRejectedValue(new Error('Upload failed'))

      await expect(
        controller.uploadPhoneList(mockCampaign, { name: 'My List' }),
      ).rejects.toThrow(BadGatewayException)
      await expect(
        controller.uploadPhoneList(mockCampaign, { name: 'My List' }),
      ).rejects.toMatchObject({
        message: 'Failed to upload phone list.',
      })
    })
  })
})
