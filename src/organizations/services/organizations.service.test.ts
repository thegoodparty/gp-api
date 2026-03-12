import { ElectionsService } from '@/elections/services/elections.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrganizationsService } from './organizations.service'

describe('OrganizationsService', () => {
  let service: OrganizationsService
  let mockGetPositionByBallotReadyId: ReturnType<typeof vi.fn>
  let mockGetDistrictId: ReturnType<typeof vi.fn>
  let mockCleanDistrictName: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGetPositionByBallotReadyId = vi.fn().mockResolvedValue(null)
    mockGetDistrictId = vi.fn().mockResolvedValue(null)
    mockCleanDistrictName = vi.fn((name: string) => name)

    service = new OrganizationsService({
      getPositionByBallotReadyId: mockGetPositionByBallotReadyId,
      getDistrictId: mockGetDistrictId,
      cleanDistrictName: mockCleanDistrictName,
    } as unknown as ElectionsService)

    vi.clearAllMocks()
  })

  describe('resolveOrgData', () => {
    it('resolves positionId from ballotReadyPositionId', async () => {
      mockGetPositionByBallotReadyId.mockResolvedValue({
        id: 'election-api-pos-id',
      })

      const result = await service.resolveOrgData({
        ballotReadyPositionId: 'br-pos-1',
      })

      expect(result.positionId).toBe('election-api-pos-id')
      expect(mockGetPositionByBallotReadyId).toHaveBeenCalledWith('br-pos-1')
    })

    it('returns null positionId when no ballotReadyPositionId provided', async () => {
      const result = await service.resolveOrgData({})

      expect(result.positionId).toBeNull()
      expect(mockGetPositionByBallotReadyId).not.toHaveBeenCalled()
    })

    it('returns null positionId when position not found', async () => {
      mockGetPositionByBallotReadyId.mockResolvedValue(null)

      const result = await service.resolveOrgData({
        ballotReadyPositionId: 'br-pos-missing',
      })

      expect(result.positionId).toBeNull()
    })

    it('resolves customPositionName from office', async () => {
      const result = await service.resolveOrgData({ office: 'Mayor' })

      expect(result.customPositionName).toBe('Mayor')
    })

    it('resolves customPositionName from otherOffice when office is Other', async () => {
      const result = await service.resolveOrgData({
        office: 'Other',
        otherOffice: 'Dog Catcher',
      })

      expect(result.customPositionName).toBe('Dog Catcher')
    })

    it('returns null customPositionName when no office provided', async () => {
      const result = await service.resolveOrgData({})

      expect(result.customPositionName).toBeNull()
    })

    it('resolves overrideDistrictId when district params provided', async () => {
      mockGetDistrictId.mockResolvedValue('district-uuid')

      const result = await service.resolveOrgData({
        state: 'CA',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 5',
      })

      expect(result.overrideDistrictId).toBe('district-uuid')
    })

    it('skips overrideDistrictId when district params incomplete', async () => {
      const result = await service.resolveOrgData({
        state: 'CA',
        L2DistrictType: 'City Council',
        // L2DistrictName missing
      })

      expect(result.overrideDistrictId).toBeNull()
      expect(mockGetDistrictId).not.toHaveBeenCalled()
    })

    it('returns null overrideDistrictId when district is exact match', async () => {
      mockGetPositionByBallotReadyId.mockResolvedValue({
        id: 'pos-id',
        district: {
          L2DistrictType: 'City Council',
          L2DistrictName: 'District 5',
        },
      })

      const result = await service.resolveOrgData({
        ballotReadyPositionId: 'br-pos-1',
        state: 'CA',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 5',
      })

      expect(result.overrideDistrictId).toBeNull()
      expect(mockGetDistrictId).not.toHaveBeenCalled()
    })

    it('resolves all three fields together', async () => {
      mockGetPositionByBallotReadyId.mockImplementation(
        (_id: string, opts?: { includeDistrict?: boolean }) => {
          if (opts?.includeDistrict) {
            return {
              id: 'pos-id',
              district: {
                L2DistrictType: 'City Council',
                L2DistrictName: 'District 1',
              },
            }
          }
          return { id: 'pos-id' }
        },
      )
      mockGetDistrictId.mockResolvedValue('override-district-uuid')

      const result = await service.resolveOrgData({
        ballotReadyPositionId: 'br-pos-1',
        office: 'Other',
        otherOffice: 'City Council Member',
        state: 'CA',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 5',
      })

      expect(result).toEqual({
        positionId: 'pos-id',
        customPositionName: 'City Council Member',
        overrideDistrictId: 'override-district-uuid',
      })
    })
  })

  describe('resolveOverrideDistrictId', () => {
    it('returns null when district exactly matches position', async () => {
      mockGetPositionByBallotReadyId.mockResolvedValue({
        id: 'pos-id',
        district: {
          L2DistrictType: 'State Senate',
          L2DistrictName: 'District 10',
        },
      })

      const result = await service.resolveOverrideDistrictId({
        positionId: 'br-pos-1',
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 10',
      })

      expect(result).toBeNull()
      expect(mockGetDistrictId).not.toHaveBeenCalled()
    })

    it('looks up district when it differs from position', async () => {
      mockGetPositionByBallotReadyId.mockResolvedValue({
        id: 'pos-id',
        district: {
          L2DistrictType: 'State Senate',
          L2DistrictName: 'District 1',
        },
      })
      mockGetDistrictId.mockResolvedValue('override-uuid')

      const result = await service.resolveOverrideDistrictId({
        positionId: 'br-pos-1',
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 10',
      })

      expect(result).toBe('override-uuid')
      expect(mockGetDistrictId).toHaveBeenCalledWith(
        'CA',
        'State Senate',
        'District 10',
      )
    })

    it('looks up district when no positionId provided', async () => {
      mockGetDistrictId.mockResolvedValue('district-uuid')

      const result = await service.resolveOverrideDistrictId({
        state: 'CA',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 5',
      })

      expect(result).toBe('district-uuid')
      expect(mockGetPositionByBallotReadyId).not.toHaveBeenCalled()
    })

    it('returns null when district not found and no position match', async () => {
      mockGetDistrictId.mockResolvedValue(null)

      const result = await service.resolveOverrideDistrictId({
        state: 'CA',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 99',
      })

      expect(result).toBeNull()
    })

    it('cleans district name before comparison', async () => {
      mockCleanDistrictName.mockReturnValue('District 10')
      mockGetPositionByBallotReadyId.mockResolvedValue({
        id: 'pos-id',
        district: {
          L2DistrictType: 'State Senate',
          L2DistrictName: 'District 10',
        },
      })

      const result = await service.resolveOverrideDistrictId({
        positionId: 'br-pos-1',
        state: 'CA',
        L2DistrictType: 'State Senate',
        L2DistrictName: 'District 10##extra data',
      })

      expect(result).toBeNull()
      expect(mockCleanDistrictName).toHaveBeenCalledWith(
        'District 10##extra data',
      )
    })

    it('looks up district when position has no district', async () => {
      mockGetPositionByBallotReadyId.mockResolvedValue({
        id: 'pos-id',
        district: null,
      })
      mockGetDistrictId.mockResolvedValue('fallback-uuid')

      const result = await service.resolveOverrideDistrictId({
        positionId: 'br-pos-1',
        state: 'CA',
        L2DistrictType: 'City Council',
        L2DistrictName: 'District 5',
      })

      expect(result).toBe('fallback-uuid')
    })
  })
})
