import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { BadRequestException } from '@nestjs/common'
import { Readable } from 'stream'
import { Campaign } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as voterFileUtil from '../../../voters/voterFile/util/voterFile.util'
import { P2pPhoneListRequestSchema } from '../schemas/p2pPhoneListRequest.schema'
import { P2P_CSV_COLUMN_MAPPINGS } from '../utils/audienceMapping.util'
import { P2pPhoneListUploadService } from './p2pPhoneListUpload.service'

vi.mock('../../../voters/voterFile/util/voterFile.util', () => ({
  typeToQuery: vi.fn().mockReturnValue('SELECT 1'),
}))

const mockCampaign: Campaign = {
  id: 1,
  userId: 1,
  slug: 'jane-doe',
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
  details: {
    state: 'CA',
    electionDate: '2026-11-03',
  },
}

const mockDistrict = {
  id: 'dist-1',
  l2Type: 'City_Portland',
  l2Name: 'PORTLAND',
}
const mockRequest: P2pPhoneListRequestSchema = { name: 'My List' }
const mockRequestShort: P2pPhoneListRequestSchema = { name: 'List' }

function makeReadable(content = 'first_name,last_name\nJane,Doe\n') {
  return Readable.from([content])
}

describe('P2pPhoneListUploadService', () => {
  let service: P2pPhoneListUploadService
  let mockVoterDb: {
    query: ReturnType<typeof vi.fn>
    csvReadableStream: ReturnType<typeof vi.fn>
  }
  let mockPeerlyPhoneList: { uploadPhoneList: ReturnType<typeof vi.fn> }
  let mockTcrCompliance: { fetchByCampaignId: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.mocked(voterFileUtil.typeToQuery).mockClear().mockReturnValue('SELECT 1')

    mockVoterDb = {
      query: vi.fn().mockResolvedValue({ rows: [{ count: '10' }] }),
      csvReadableStream: vi.fn().mockResolvedValue(makeReadable()),
    }
    mockPeerlyPhoneList = {
      uploadPhoneList: vi.fn().mockResolvedValue('token-abc'),
    }
    mockTcrCompliance = {
      fetchByCampaignId: vi
        .fn()
        .mockResolvedValue({ peerlyIdentityId: 'peerly-id-1' }),
    }
    service = new P2pPhoneListUploadService(
      mockVoterDb as never,
      mockPeerlyPhoneList as never,
      mockTcrCompliance as never,
      createMockLogger(),
    )
  })

  describe('uploadPhoneList', () => {
    it('throws BadRequestException when TCR compliance record is missing', async () => {
      mockTcrCompliance.fetchByCampaignId.mockResolvedValue(null)

      await expect(
        service.uploadPhoneList(mockCampaign, mockRequest, mockDistrict),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when peerlyIdentityId is missing', async () => {
      mockTcrCompliance.fetchByCampaignId.mockResolvedValue({
        peerlyIdentityId: null,
      })

      await expect(
        service.uploadPhoneList(mockCampaign, mockRequest, mockDistrict),
      ).rejects.toThrow(BadRequestException)
    })

    it('returns token and listName on success', async () => {
      const result = await service.uploadPhoneList(
        mockCampaign,
        mockRequest,
        mockDistrict,
      )

      expect(result).toEqual({ token: 'token-abc', listName: 'My List' })
    })

    it('uploads with the correct peerlyIdentityId', async () => {
      await service.uploadPhoneList(mockCampaign, mockRequest, mockDistrict)

      expect(mockPeerlyPhoneList.uploadPhoneList).toHaveBeenCalledWith(
        expect.objectContaining({
          identityId: 'peerly-id-1',
          listName: 'My List',
        }),
      )
    })
  })

  describe('fixColumns fallback', () => {
    it('calls typeToQuery twice: first with fixColumns=false, second with fixColumns=false when count > 0', async () => {
      mockVoterDb.query.mockResolvedValue({ rows: [{ count: '42' }] })

      await service.uploadPhoneList(
        mockCampaign,
        mockRequestShort,
        mockDistrict,
      )

      const calls = vi.mocked(voterFileUtil.typeToQuery).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0][6]).toBe(false) // count query: fixColumns=false
      expect(calls[1][6]).toBe(false) // CSV query: fixColumns=false (count > 0)
    })

    it('calls typeToQuery twice: second with fixColumns=true when count is 0', async () => {
      mockVoterDb.query.mockResolvedValue({ rows: [{ count: '0' }] })

      await service.uploadPhoneList(
        mockCampaign,
        mockRequestShort,
        mockDistrict,
      )

      const calls = vi.mocked(voterFileUtil.typeToQuery).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0][6]).toBe(false) // count query: always fixColumns=false
      expect(calls[1][6]).toBe(true) // CSV query: fixColumns=true (count was 0)
    })

    it('calls typeToQuery twice: second with fixColumns=true when count query fails with 42703', async () => {
      const columnNotFoundError = Object.assign(
        new Error('column does not exist'),
        { code: '42703' },
      )
      mockVoterDb.query.mockRejectedValue(columnNotFoundError)

      await service.uploadPhoneList(
        mockCampaign,
        mockRequestShort,
        mockDistrict,
      )

      const calls = vi.mocked(voterFileUtil.typeToQuery).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[0][6]).toBe(false) // count query: always fixColumns=false
      expect(calls[1][6]).toBe(true) // CSV query: fixColumns=true (column not found)
    })

    it('rethrows count query errors that are not column-not-found', async () => {
      const dbError = Object.assign(new Error('connection timeout'), {
        code: '08006',
      })
      mockVoterDb.query.mockRejectedValue(dbError)

      await expect(
        service.uploadPhoneList(mockCampaign, mockRequestShort, mockDistrict),
      ).rejects.toThrow(BadRequestException)
    })

    it('passes P2P_CSV_COLUMN_MAPPINGS on the second typeToQuery call', async () => {
      await service.uploadPhoneList(
        mockCampaign,
        mockRequestShort,
        mockDistrict,
      )

      const calls = vi.mocked(voterFileUtil.typeToQuery).mock.calls
      expect(calls).toHaveLength(2)
      expect(calls[1][7]).toBe(P2P_CSV_COLUMN_MAPPINGS)
    })
  })
})
