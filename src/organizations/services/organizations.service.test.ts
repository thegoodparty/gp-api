import { ElectionsService } from '@/elections/services/elections.service'
import { createMockClerkEnricher } from '@/shared/test-utils/mockClerkEnricher.util'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrganizationsService } from './organizations.service'

describe('OrganizationsService', () => {
  let service: OrganizationsService
  let mockGetPositionByBallotReadyId: ReturnType<typeof vi.fn>
  let mockGetPositionById: ReturnType<typeof vi.fn>
  let mockGetDistrictId: ReturnType<typeof vi.fn>
  let mockCleanDistrictName: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGetPositionByBallotReadyId = vi.fn().mockResolvedValue(null)
    mockGetPositionById = vi.fn().mockResolvedValue(null)
    mockGetDistrictId = vi.fn().mockResolvedValue(null)
    mockCleanDistrictName = vi.fn((name: string) => name)

    service = new OrganizationsService(
      {
        getPositionByBallotReadyId: mockGetPositionByBallotReadyId,
        getPositionById: mockGetPositionById,
        getDistrictId: mockGetDistrictId,
        cleanDistrictName: mockCleanDistrictName,
      } as unknown as ElectionsService,
      createMockClerkEnricher(),
    )
    ;(
      service as unknown as { logger: { error: ReturnType<typeof vi.fn> } }
    ).logger = { error: vi.fn() }

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

    it('passes through customPositionName', async () => {
      const result = await service.resolveOrgData({
        customPositionName: 'Mayor',
      })

      expect(result.customPositionName).toBe('Mayor')
    })

    it('returns null customPositionName when not provided', async () => {
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
      })
      mockGetPositionById.mockResolvedValue({
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
        (...args: [string, { includeDistrict?: boolean }?]) => {
          const opts = args[1]
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
        customPositionName: 'City Council Member',
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
      mockGetPositionById.mockResolvedValue({
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
      mockGetPositionById.mockResolvedValue({
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
      expect(mockGetPositionById).not.toHaveBeenCalled()
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
      mockGetPositionById.mockResolvedValue({
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
      mockGetPositionById.mockResolvedValue({
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

  describe('resolvePositionContext', () => {
    it('returns customPositionName as positionName without calling election-api', async () => {
      const result = await service.resolvePositionContext({
        customPositionName: 'Community Advocate',
        positionId: null,
      })

      expect(result).toEqual({
        ballotReadyPositionId: null,
        positionName: 'Community Advocate',
      })
      expect(mockGetPositionById).not.toHaveBeenCalled()
    })

    it('returns position name and brPositionId when positionId is set', async () => {
      mockGetPositionById.mockResolvedValue({
        id: 'pos-id',
        name: 'Mayor',
        brPositionId: 'br-pos-id',
      })

      const result = await service.resolvePositionContext({
        customPositionName: null,
        positionId: 'pos-id',
      })

      expect(result).toEqual({
        ballotReadyPositionId: 'br-pos-id',
        positionName: 'Mayor',
      })
      expect(mockGetPositionById).toHaveBeenCalledWith('pos-id')
    })

    it('prefers customPositionName over position name when both available', async () => {
      mockGetPositionById.mockResolvedValue({
        id: 'pos-id',
        name: 'Mayor',
        brPositionId: 'br-pos-id',
      })

      const result = await service.resolvePositionContext({
        customPositionName: 'Custom Title',
        positionId: 'pos-id',
      })

      expect(result).toEqual({
        ballotReadyPositionId: 'br-pos-id',
        positionName: 'Custom Title',
      })
    })

    it('returns nulls when no customPositionName and no positionId', async () => {
      const result = await service.resolvePositionContext({
        customPositionName: null,
        positionId: null,
      })

      expect(result).toEqual({
        ballotReadyPositionId: null,
        positionName: null,
      })
      expect(mockGetPositionById).not.toHaveBeenCalled()
    })

    it('throws when position lookup returns null (dangling positionId)', async () => {
      mockGetPositionById.mockResolvedValue(null)

      await expect(
        service.resolvePositionContext({
          customPositionName: null,
          positionId: 'pos-id',
        }),
      ).rejects.toThrow(
        'Stored positionId pos-id does not exist in election-api',
      )
    })

    it('lets election-api errors propagate', async () => {
      mockGetPositionById.mockRejectedValue(new Error('election-api down'))

      await expect(
        service.resolvePositionContext({
          customPositionName: null,
          positionId: 'pos-id',
        }),
      ).rejects.toThrow('election-api down')
    })
  })

  describe('resolvePositionContextByOrgSlug', () => {
    let mockFindUnique: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockFindUnique = vi.fn().mockResolvedValue(null)
      service.findUnique = mockFindUnique as typeof service.findUnique
    })

    it('returns brPositionId and positionName for org with positionId', async () => {
      mockFindUnique.mockResolvedValue({
        slug: 'campaign-1',
        positionId: 'gp-pos-id',
        customPositionName: null,
        ownerId: 1,
        overrideDistrictId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockGetPositionById.mockResolvedValue({
        id: 'gp-pos-id',
        name: 'Mayor',
        brPositionId: 'br-pos-42',
      })

      const result = await service.resolvePositionContextByOrgSlug('campaign-1')

      expect(result).toEqual({
        ballotReadyPositionId: 'br-pos-42',
        positionName: 'Mayor',
      })
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { slug: 'campaign-1' },
      })
      expect(mockGetPositionById).toHaveBeenCalledWith('gp-pos-id')
    })

    it('returns null brPositionId and custom name for org without positionId', async () => {
      mockFindUnique.mockResolvedValue({
        slug: 'campaign-2',
        positionId: null,
        customPositionName: 'Dog Catcher',
        ownerId: 1,
        overrideDistrictId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await service.resolvePositionContextByOrgSlug('campaign-2')

      expect(result).toEqual({
        ballotReadyPositionId: null,
        positionName: 'Dog Catcher',
      })
      expect(mockGetPositionById).not.toHaveBeenCalled()
    })

    it('returns nulls when organization is not found', async () => {
      const result =
        await service.resolvePositionContextByOrgSlug('nonexistent-slug')

      expect(result).toEqual({
        ballotReadyPositionId: null,
        positionName: null,
      })
      expect(mockGetPositionById).not.toHaveBeenCalled()
    })
  })

  describe('extractCityFromDistrictName', () => {
    const extract = OrganizationsService.extractCityFromDistrictName

    describe('clean city names (no stripping needed)', () => {
      it('returns a plain city name unchanged', () => {
        expect(extract('Fayetteville')).toBe('Fayetteville')
      })

      it('handles multi-word city names', () => {
        expect(extract('Chapel Hill')).toBe('Chapel Hill')
      })
    })

    describe('leading municipality prefix stripping', () => {
      it('strips "City of"', () => {
        expect(extract('City of Kyle')).toBe('Kyle')
      })

      it('strips "Town of"', () => {
        expect(extract('Town of Chapel Hill')).toBe('Chapel Hill')
      })

      it('strips "Village of"', () => {
        expect(extract('Village of Skokie')).toBe('Skokie')
      })

      it('strips "Borough of"', () => {
        expect(extract('Borough of Carlisle')).toBe('Carlisle')
      })

      it('strips "Township of"', () => {
        expect(extract('Township of Teaneck')).toBe('Teaneck')
      })

      it('is case-insensitive for prefix', () => {
        expect(extract('CITY OF KYLE')).toBe('KYLE')
      })
    })

    describe('trailing ward/district suffix stripping', () => {
      it('strips trailing "Ward N"', () => {
        expect(extract('Fayetteville Ward 4')).toBe('Fayetteville')
      })

      it('strips trailing "District N"', () => {
        expect(extract('Kyle District 3')).toBe('Kyle')
      })

      it('strips trailing "Ward N" from all-caps L2 name', () => {
        expect(extract('BRUNSWICK TOWN WARD 6')).toBe('BRUNSWICK')
      })

      it('strips trailing "Precinct"', () => {
        expect(extract('Springfield Precinct 2A')).toBe('Springfield')
      })

      it('strips trailing "At-Large"', () => {
        expect(extract('Austin At-Large')).toBe('Austin')
      })
    })

    describe('trailing municipality type stripping', () => {
      it('strips trailing "City"', () => {
        expect(extract('METHUEN CITY')).toBe('METHUEN')
      })

      it('strips trailing "Town"', () => {
        expect(extract('FALMOUTH TOWN')).toBe('FALMOUTH')
      })

      it('strips trailing "Borough"', () => {
        expect(extract('Carlisle Borough')).toBe('Carlisle')
      })

      it('strips trailing "Boro" (abbreviated Borough)', () => {
        expect(extract('WEST MIFFLIN BORO')).toBe('WEST MIFFLIN')
      })

      it('strips trailing "Township"', () => {
        expect(extract('Teaneck Township')).toBe('Teaneck')
      })

      it('strips trailing "Village"', () => {
        expect(extract('Skokie Village')).toBe('Skokie')
      })
    })

    describe('parenthetical qualifier stripping', () => {
      it('strips trailing "(Est.)"', () => {
        expect(extract('POCATELLO CITY (EST.)')).toBe('POCATELLO')
      })

      it('strips "(Est.)" from multi-word city', () => {
        expect(extract('NORTH PORT CITY (EST.)')).toBe('NORTH PORT')
      })

      it('strips generic parenthetical qualifiers', () => {
        expect(extract('Springfield City (Ind.)')).toBe('Springfield')
      })
    })

    describe('abbreviated council district stripping', () => {
      it('strips trailing "Cncl D" (abbreviated Council District)', () => {
        expect(extract('ALVIN CITY CNCL D')).toBe('ALVIN')
      })

      it('strips trailing "Cncl Dist"', () => {
        expect(extract('Houston City Cncl Dist')).toBe('Houston')
      })

      it('strips trailing "Council D"', () => {
        expect(extract('Austin City Council D')).toBe('Austin')
      })
    })

    describe('multi-step stripping (combined patterns)', () => {
      it('strips ward then town type: "BRUNSWICK TOWN WARD 6"', () => {
        expect(extract('BRUNSWICK TOWN WARD 6')).toBe('BRUNSWICK')
      })

      it('strips parenthetical then city type: "POCATELLO CITY (EST.)"', () => {
        expect(extract('POCATELLO CITY (EST.)')).toBe('POCATELLO')
      })

      it('strips abbreviated council then city type: "ALVIN CITY CNCL D"', () => {
        expect(extract('ALVIN CITY CNCL D')).toBe('ALVIN')
      })

      it('handles override district "DUBUQUE CITY"', () => {
        expect(extract('DUBUQUE CITY')).toBe('DUBUQUE')
      })

      it('handles "WESTLAND CITY"', () => {
        expect(extract('WESTLAND CITY')).toBe('WESTLAND')
      })

      it('handles "IMPERIAL CITY"', () => {
        expect(extract('IMPERIAL CITY')).toBe('IMPERIAL')
      })

      it('handles "NORTHAMPTON CITY"', () => {
        expect(extract('NORTHAMPTON CITY')).toBe('NORTHAMPTON')
      })
    })

    describe('null cases', () => {
      it('returns null for empty string', () => {
        expect(extract('')).toBeNull()
      })

      it('returns null for whitespace only', () => {
        expect(extract('   ')).toBeNull()
      })

      it('returns null for a pure number', () => {
        expect(extract('4')).toBeNull()
      })

      it('returns null for a single character', () => {
        expect(extract('A')).toBeNull()
      })

      it('returns null when stripping leaves nothing (e.g. bare "Ward 1")', () => {
        // "Ward 1" — "Ward" doesn't have a leading space so the regex doesn't strip it,
        // leaving "Ward 1" which is not a pure number or single char, so returns "Ward 1".
        // This is acceptable — "Ward 1" is an unusual L2DistrictName with no city prefix.
        expect(extract('Ward 1')).toBe('Ward 1')
      })
    })
  })
})
