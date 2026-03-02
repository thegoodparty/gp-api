import { BadRequestException } from '@nestjs/common'
import { Readable } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignWith } from '../../../campaigns/campaigns.types'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { P2pPhoneListRequestSchema } from '../schemas/p2pPhoneListRequest.schema'
import { P2pPhoneListUploadService } from './p2pPhoneListUpload.service'

// A City_X electionType makes the fixColumns difference observable in the SQL:
// fixColumns=false → WHERE "City_Portland" = 'PORTLAND'
// fixColumns=true  → WHERE "City" = 'PORTLAND'  (via fixCityCountyColumns)
const mockCampaign: CampaignWith<'pathToVictory'> = {
  id: 1,
  userId: 1,
  slug: 'jane-doe',
  organizationSlug: null,
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
  pathToVictory: {
    id: 1,
    campaignId: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    data: {
      electionType: 'City_Portland',
      electionLocation: 'PORTLAND',
    },
  },
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
        service.uploadPhoneList(mockCampaign, mockRequest),
      ).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when peerlyIdentityId is missing', async () => {
      mockTcrCompliance.fetchByCampaignId.mockResolvedValue({
        peerlyIdentityId: null,
      })

      await expect(
        service.uploadPhoneList(mockCampaign, mockRequest),
      ).rejects.toThrow(BadRequestException)
    })

    it('returns token and listName on success', async () => {
      const result = await service.uploadPhoneList(mockCampaign, mockRequest)

      expect(result).toEqual({ token: 'token-abc', listName: 'My List' })
    })

    it('uploads with the correct peerlyIdentityId', async () => {
      await service.uploadPhoneList(mockCampaign, mockRequest)

      expect(mockPeerlyPhoneList.uploadPhoneList).toHaveBeenCalledWith(
        expect.objectContaining({
          identityId: 'peerly-id-1',
          listName: 'My List',
        }),
      )
    })
  })

  describe('fixColumns fallback', () => {
    it('count query always uses COUNT(*) with fixColumns=false', async () => {
      await service.uploadPhoneList(mockCampaign, mockRequestShort)

      const [countQuery] = mockVoterDb.query.mock.calls[0]
      expect(countQuery).toContain('COUNT(*)')
      // fixColumns=false means the raw electionType column name is used
      expect(countQuery).toContain('"City_Portland"')
    })

    it('CSV query uses standard column name when count > 0', async () => {
      mockVoterDb.query.mockResolvedValue({ rows: [{ count: '42' }] })

      await service.uploadPhoneList(mockCampaign, mockRequestShort)

      const [csvQuery] = mockVoterDb.csvReadableStream.mock.calls[0]
      expect(csvQuery).toContain('"City_Portland"')
      expect(csvQuery).not.toContain('"City"')
    })

    it('CSV query uses fixColumns=true when count is 0', async () => {
      mockVoterDb.query.mockResolvedValue({ rows: [{ count: '0' }] })

      await service.uploadPhoneList(mockCampaign, mockRequestShort)

      const [csvQuery] = mockVoterDb.csvReadableStream.mock.calls[0]
      // fixCityCountyColumns normalises City_Portland → City
      expect(csvQuery).toContain('"City"')
      expect(csvQuery).not.toContain('"City_Portland"')
    })

    it('CSV query uses fixColumns=true when count query fails with column not found (42703)', async () => {
      const columnNotFoundError = Object.assign(new Error('column does not exist'), {
        code: '42703',
      })
      mockVoterDb.query.mockRejectedValue(columnNotFoundError)

      await service.uploadPhoneList(mockCampaign, mockRequestShort)

      const [csvQuery] = mockVoterDb.csvReadableStream.mock.calls[0]
      expect(csvQuery).toContain('"City"')
      expect(csvQuery).not.toContain('"City_Portland"')
    })

    it('rethrows count query errors that are not column-not-found', async () => {
      const dbError = Object.assign(new Error('connection timeout'), { code: '08006' })
      mockVoterDb.query.mockRejectedValue(dbError)

      await expect(
        service.uploadPhoneList(mockCampaign, mockRequestShort),
      ).rejects.toThrow(BadRequestException)
    })

    it('CSV query selects P2P column mappings', async () => {
      await service.uploadPhoneList(mockCampaign, mockRequestShort)

      const [csvQuery] = mockVoterDb.csvReadableStream.mock.calls[0]
      expect(csvQuery).toContain('"Voters_FirstName"')
      expect(csvQuery).toContain('"VoterTelephones_CellPhoneFormatted"')
    })
  })
})
