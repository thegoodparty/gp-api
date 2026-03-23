import { P2P_JOB_DEFAULTS } from '@/vendors/peerly/constants/p2pJob.constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Campaign } from '@prisma/client'
import type { GooglePlacesApiResponse } from 'src/shared/types/GooglePlaces.types'
import zipcodes from 'zipcodes'
import {
  type AreaCodeFromZipLookup,
  type CampaignGeographyInput,
  type PlacesAddressLookup,
  parseDetailsGeography,
  resolveJobGeographyFromAddress,
  resolveP2pJobGeography,
} from './campaignGeography.util'

vi.mock('zipcodes', () => ({
  default: { lookup: vi.fn() },
}))

describe('campaignGeography.util', () => {
  describe('parseDetailsGeography', () => {
    it('returns null for null details', () => {
      expect(parseDetailsGeography(null)).toBe(null)
    })

    it('returns null for undefined details', () => {
      expect(parseDetailsGeography(undefined)).toBe(null)
    })

    it('returns null for non-object details', () => {
      expect(parseDetailsGeography('string' as Campaign['details'])).toBe(null)
      expect(parseDetailsGeography(42 as Campaign['details'])).toBe(null)
    })

    it('returns null when state and zip are both missing or empty', () => {
      expect(parseDetailsGeography({})).toBe(null)
      expect(parseDetailsGeography({ state: '', zip: '' })).toBe(null)
      expect(parseDetailsGeography({ state: '  ', zip: '  ' })).toBe(null)
    })

    it('extracts and trims state and zip from details', () => {
      expect(parseDetailsGeography({ state: 'CA', zip: '92020' })).toEqual({
        state: 'CA',
        zip: '92020',
      })
      expect(
        parseDetailsGeography({ state: '  CA  ', zip: ' 92020 ' }),
      ).toEqual({ state: 'CA', zip: '92020' })
    })

    it('returns only state when zip is missing', () => {
      expect(parseDetailsGeography({ state: 'NY' })).toEqual({
        state: 'NY',
        zip: undefined,
      })
    })

    it('returns only zip when state is missing', () => {
      expect(parseDetailsGeography({ zip: '10001' })).toEqual({
        state: undefined,
        zip: '10001',
      })
    })

    it('ignores non-string state/zip', () => {
      const details = JSON.parse(
        '{"state":123,"zip":null}',
      ) as Campaign['details']
      expect(parseDetailsGeography(details)).toBe(null)
    })
  })

  describe('resolveJobGeographyFromAddress', () => {
    let areaCodeFromZipService: AreaCodeFromZipLookup

    beforeEach(() => {
      areaCodeFromZipService = {
        getAreaCodeFromZip: vi.fn(),
      }
    })

    it('returns didState and didNpaSubset when state and area codes present', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '619',
        '858',
      ])
      const result = await resolveJobGeographyFromAddress(
        { stateCode: 'CA', postalCodeValue: '92020' },
        { areaCodeFromZipService },
      )
      expect(result).toEqual({ didState: 'CA', didNpaSubset: ['619', '858'] })
      expect(areaCodeFromZipService.getAreaCodeFromZip).toHaveBeenCalledWith(
        '92020',
      )
    })

    it('defaults didState to P2P_JOB_DEFAULTS.DID_STATE when stateCode and zip lookup missing', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([])
      vi.mocked(zipcodes.lookup).mockReturnValue(undefined)
      const result = await resolveJobGeographyFromAddress(
        { stateCode: undefined, postalCodeValue: '92020' },
        { areaCodeFromZipService },
      )
      expect(result.didState).toBe(P2P_JOB_DEFAULTS.DID_STATE)
      expect(result.didNpaSubset).toEqual([])
    })

    it('derives didState from zip via zipcodes.lookup when stateCode missing', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '619',
      ])
      vi.mocked(zipcodes.lookup).mockReturnValue({
        state: 'CA',
      } as zipcodes.ZipCode)
      const result = await resolveJobGeographyFromAddress(
        { stateCode: undefined, postalCodeValue: '92020' },
        { areaCodeFromZipService },
      )
      expect(zipcodes.lookup).toHaveBeenCalledWith('92020')
      expect(result.didState).toBe('CA')
      expect(result.didNpaSubset).toEqual(['619'])
    })

    it('uses stateCode as-is (callers may trim before calling)', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '760',
      ])
      const result = await resolveJobGeographyFromAddress(
        { stateCode: 'CA', postalCodeValue: '92201' },
        { areaCodeFromZipService },
      )
      expect(result.didState).toBe('CA')
    })

    it('returns empty didNpaSubset when postalCodeValue empty or areaCode returns empty', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue(
        null,
      )
      const result = await resolveJobGeographyFromAddress(
        { stateCode: 'CA', postalCodeValue: '' },
        { areaCodeFromZipService },
      )
      expect(result.didNpaSubset).toEqual([])
    })

    it('returns empty didNpaSubset when getAreaCodeFromZip returns empty array', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([])
      const result = await resolveJobGeographyFromAddress(
        { stateCode: 'CA', postalCodeValue: '99999' },
        { areaCodeFromZipService },
      )
      expect(result.didNpaSubset).toEqual([])
    })

    it('strips ZIP+4 suffix so area-code lookup receives 5-digit zip', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '518',
      ])
      const result = await resolveJobGeographyFromAddress(
        { stateCode: 'NY', postalCodeValue: '12345-6789' },
        { areaCodeFromZipService },
      )
      expect(areaCodeFromZipService.getAreaCodeFromZip).toHaveBeenCalledWith(
        '12345',
      )
      expect(result).toEqual({ didState: 'NY', didNpaSubset: ['518'] })
    })
  })

  describe('resolveP2pJobGeography', () => {
    const minimalPlaceWithStateAndZip: GooglePlacesApiResponse = {
      address_components: [
        {
          types: ['administrative_area_level_1', 'political'],
          short_name: 'CA',
          long_name: 'California',
        },
        {
          types: ['postal_code'],
          short_name: '92020',
          long_name: '92020',
        },
      ],
    }

    let placesService: PlacesAddressLookup
    let areaCodeFromZipService: AreaCodeFromZipLookup
    let logger: { warn: (message: string, context?: object) => void }

    beforeEach(() => {
      placesService = {
        getAddressByPlaceId: vi.fn(),
      }
      areaCodeFromZipService = {
        getAreaCodeFromZip: vi.fn(),
      }
      logger = { warn: vi.fn() }
    })

    it('uses placeId path when campaign has placeId and returns geography from address', async () => {
      vi.mocked(placesService.getAddressByPlaceId).mockResolvedValue(
        minimalPlaceWithStateAndZip,
      )
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '619',
        '858',
      ])
      const campaign: CampaignGeographyInput = {
        placeId: 'ChIJ...',
        details: null,
      }
      const result = await resolveP2pJobGeography(campaign, {
        placesService,
        areaCodeFromZipService,
        logger,
      })
      expect(result).toEqual({ didState: 'CA', didNpaSubset: ['619', '858'] })
      expect(placesService.getAddressByPlaceId).toHaveBeenCalledWith('ChIJ...')
      expect(areaCodeFromZipService.getAreaCodeFromZip).toHaveBeenCalledWith(
        '92020',
      )
    })

    it('falls back to details when placeId path throws', async () => {
      vi.mocked(placesService.getAddressByPlaceId).mockRejectedValue(
        new Error('Places API error'),
      )
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '760',
      ])
      const campaign: CampaignGeographyInput = {
        placeId: 'ChIJ...',
        details: { state: 'CA', zip: '92201' },
      }
      const result = await resolveP2pJobGeography(campaign, {
        placesService,
        areaCodeFromZipService,
        logger,
      })
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to resolve placeId geography',
        { err: expect.any(Error), placeId: 'ChIJ...' },
      )
      expect(result).toEqual({ didState: 'CA', didNpaSubset: ['760'] })
    })

    it('uses campaign.details.state and details.zip when no placeId', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '212',
        '718',
      ])
      const campaign: CampaignGeographyInput = {
        placeId: null,
        details: { state: 'NY', zip: '10001' },
      }
      const result = await resolveP2pJobGeography(campaign, {
        placesService,
        areaCodeFromZipService,
        logger,
      })
      expect(result).toEqual({ didState: 'NY', didNpaSubset: ['212', '718'] })
      expect(placesService.getAddressByPlaceId).not.toHaveBeenCalled()
      expect(areaCodeFromZipService.getAreaCodeFromZip).toHaveBeenCalledWith(
        '10001',
      )
    })

    it('uses zipcodes.lookup for state when no placeId and details has zip but no state', async () => {
      vi.mocked(zipcodes.lookup).mockReturnValue({
        state: 'CA',
        city: 'El Centro',
        zip: '92243',
      } as ReturnType<typeof zipcodes.lookup>)
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([
        '760',
      ])
      const campaign: CampaignGeographyInput = {
        placeId: null,
        details: { zip: '92243' },
      }
      const result = await resolveP2pJobGeography(campaign, {
        placesService,
        areaCodeFromZipService,
        logger,
      })
      expect(result).toEqual({ didState: 'CA', didNpaSubset: ['760'] })
      expect(zipcodes.lookup).toHaveBeenCalledWith('92243')
    })

    it('defaults didState to P2P_JOB_DEFAULTS.DID_STATE when no placeId and no details', async () => {
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([])
      const campaign: CampaignGeographyInput = {
        placeId: null,
        details: null,
      }
      const result = await resolveP2pJobGeography(campaign, {
        placesService,
        areaCodeFromZipService,
        logger,
      })
      expect(result.didState).toBe(P2P_JOB_DEFAULTS.DID_STATE)
      expect(result.didNpaSubset).toEqual([])
    })

    it('works without logger', async () => {
      vi.mocked(placesService.getAddressByPlaceId).mockRejectedValue(
        new Error('Places error'),
      )
      vi.mocked(areaCodeFromZipService.getAreaCodeFromZip).mockResolvedValue([])
      const campaign: CampaignGeographyInput = {
        placeId: 'ChIJ...',
        details: { zip: '92201' },
      }
      await expect(
        resolveP2pJobGeography(campaign, {
          placesService,
          areaCodeFromZipService,
        }),
      ).resolves.toEqual({
        didState: expect.any(String),
        didNpaSubset: [],
      })
    })
  })
})
