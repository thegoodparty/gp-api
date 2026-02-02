/**
 * Resolves P2P job geography (state + area codes) from a campaign’s placeId or details.
 * Used by outreach and 10DLC flows so Peerly jobs get correct didState and didNpaSubset.
 */
import { P2P_JOB_DEFAULTS } from '@/vendors/peerly/constants/p2pJob.constants'
import { Campaign } from '@prisma/client'
import { extractAddressComponents } from 'src/vendors/google/util/GooglePlaces.util'
import type { GooglePlacesApiResponse } from 'src/shared/types/GooglePlaces.types'
import zipcodes from 'zipcodes'

/** Minimal shape for area-code lookup (avoids full service dependency in tests). */
export interface AreaCodeFromZipLookup {
  getAreaCodeFromZip(zip: string): Promise<string[] | null>
}

/** Minimal shape for Places address lookup (avoids full service dependency in tests). */
export interface PlacesAddressLookup {
  getAddressByPlaceId(placeId: string): Promise<GooglePlacesApiResponse>
}

/** Geography fields we read from campaign.details for P2P job resolution */
export interface CampaignDetailsGeography {
  state?: string
  zip?: string
}

export interface P2pJobGeographyResult {
  didState: string
  didNpaSubset: string[]
}

export interface ResolveP2pJobGeographyServices {
  placesService: PlacesAddressLookup
  areaCodeFromZipService: AreaCodeFromZipLookup
  logger?: { warn: (context: object, message: string) => void }
}

function isDetailsRecord(
  details: Campaign['details'] | null | undefined,
): details is Record<string, unknown> {
  return (
    details != null &&
    typeof details === 'object' &&
    !Array.isArray(details)
  )
}

export function parseDetailsGeography(
  details: Campaign['details'] | null | undefined,
): CampaignDetailsGeography | null {
  if (!isDetailsRecord(details)) return null
  const state =
    typeof details.state === 'string' && details.state.trim() !== ''
      ? details.state.trim()
      : undefined
  const zip =
    typeof details.zip === 'string' && details.zip.trim() !== ''
      ? details.zip.trim()
      : undefined
  if (state === undefined && zip === undefined) return null
  return { state, zip }
}

function normalizeZip(z: string): string | undefined {
  return z ? String(z).trim() : undefined
}

async function getAreaCodesForZip(
  zip: string | undefined,
  areaCodeFromZipService: AreaCodeFromZipLookup,
): Promise<string[]> {
  if (zip == null || zip === '') return []
  const codes = await areaCodeFromZipService.getAreaCodeFromZip(zip)
  return Array.isArray(codes) && codes.length > 0 ? codes : []
}

export interface ResolveJobGeographyFromAddressParams {
  stateCode: string | undefined
  postalCodeValue: string | undefined
}

export interface ResolveJobGeographyFromAddressServices {
  areaCodeFromZipService: AreaCodeFromZipLookup
}

/**
 * Use when you already have address (e.g. from Places). Returns didState + didNpaSubset for jobAreas.
 * No Places call; only resolves area codes from zip and normalizes state.
 */
export async function resolveJobGeographyFromAddress(
  { stateCode, postalCodeValue }: ResolveJobGeographyFromAddressParams,
  services: ResolveJobGeographyFromAddressServices,
): Promise<P2pJobGeographyResult> {
  const zip = normalizeZip(postalCodeValue ?? '')
  const didNpaSubset = await getAreaCodesForZip(
    zip,
    services.areaCodeFromZipService,
  )
  const didState = stateCode?.trim() ?? P2P_JOB_DEFAULTS.DID_STATE
  return { didState, didNpaSubset }
}

/** Minimal campaign shape required for geography resolution (placeId and/or details); details may be null. */
export type CampaignGeographyInput = {
  placeId: Campaign['placeId']
  details: Campaign['details'] | null
}

/**
 * Resolves didState and didNpaSubset for P2P job creation from campaign.
 * Path 1: campaign has placeId → Google Places address → state + postal code → area codes from zip.
 * Path 2: no placeId (e.g. is_pro) → campaign.details.state + details.zip; state from zipcodes.lookup if missing.
 */
export async function resolveP2pJobGeography(
  campaign: CampaignGeographyInput,
  services: ResolveP2pJobGeographyServices,
): Promise<P2pJobGeographyResult> {
  const { placesService, areaCodeFromZipService, logger } = services
  const details = parseDetailsGeography(campaign.details)

  // 1) Prefer Place ID data when available
  if (campaign.placeId) {
    try {
      const place = await placesService.getAddressByPlaceId(campaign.placeId)
      const { state, postalCode } = extractAddressComponents(place)

      return resolveJobGeographyFromAddress(
        {
          stateCode: state?.short_name?.trim(),
          postalCodeValue: postalCode?.long_name ?? '',
        },
        { areaCodeFromZipService },
      )
    } catch (err) {
      logger?.warn(
        { err, placeId: campaign.placeId },
        'Failed to resolve placeId geography',
      )
    }
  }

  // 2) Fallback to campaign.details (and zip lookup for state)
  const zip = normalizeZip(details?.zip ?? '')
  const didState =
    details?.state?.trim() ??
    (zip ? zipcodes.lookup(zip)?.state : undefined) ??
    P2P_JOB_DEFAULTS.DID_STATE

  return {
    didState,
    didNpaSubset: await getAreaCodesForZip(zip, areaCodeFromZipService),
  }
}
