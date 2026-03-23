/**
 * Resolves P2P job geography (state + area codes) from a campaign’s placeId or details.
 * Used by outreach and 10DLC flows so Peerly jobs get correct didState and didNpaSubset.
 */
import { P2P_JOB_DEFAULTS } from '@/vendors/peerly/constants/p2pJob.constants'
import { Campaign } from '@prisma/client'
import type { GooglePlacesApiResponse } from 'src/shared/types/GooglePlaces.types'
import { extractAddressComponents } from 'src/vendors/google/util/GooglePlaces.util'
import zipcodes from 'zipcodes'

interface DetailsGeographyRecord {
  state?: string
  zip?: string
}

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

export interface GeographyLogger {
  warn: (message: string, context?: object) => void
}

export interface ResolveP2pJobGeographyServices {
  placesService: PlacesAddressLookup
  areaCodeFromZipService: AreaCodeFromZipLookup
  logger?: GeographyLogger
}

function isDetailsRecord(
  details: Campaign['details'] | null | undefined,
): details is DetailsGeographyRecord {
  return (
    details != null && typeof details === 'object' && !Array.isArray(details)
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

/**
 * Normalizes zip for lookups: trims and strips US ZIP+4 suffix (e.g. 12345-6789 → 12345)
 * so zipcodes.lookup() and area-code services receive the 5-digit portion.
 */
function normalizeZip(z: string | undefined): string | undefined {
  if (z == null || z === '') return undefined
  const trimmed = String(z).trim()
  if (trimmed === '') return undefined
  const fiveDigit = trimmed.replace(/-\d{4}$/, '')
  return fiveDigit
}

async function getAreaCodesForZip(
  zip: string | undefined,
  areaCodeFromZipService: AreaCodeFromZipLookup,
  logger?: GeographyLogger,
): Promise<string[]> {
  if (zip == null || zip === '') return []
  const codes = await areaCodeFromZipService.getAreaCodeFromZip(zip)
  if (!Array.isArray(codes) || codes.length === 0) {
    logger?.warn('Area code lookup returned no results for zip', { zip })
    return []
  }
  return codes
}

export interface ResolveJobGeographyFromAddressParams {
  stateCode: string | undefined
  postalCodeValue: string | undefined
}

export interface ResolveJobGeographyFromAddressServices {
  areaCodeFromZipService: AreaCodeFromZipLookup
  logger?: GeographyLogger
}

/**
 * Use when you already have address (e.g. from Places). Returns didState + didNpaSubset for jobAreas.
 * No Places call; only resolves area codes from zip. Callers may trim stateCode before calling.
 */
export async function resolveJobGeographyFromAddress(
  { stateCode, postalCodeValue }: ResolveJobGeographyFromAddressParams,
  services: ResolveJobGeographyFromAddressServices,
): Promise<P2pJobGeographyResult> {
  const zip = normalizeZip(postalCodeValue)
  const didNpaSubset = await getAreaCodesForZip(
    zip,
    services.areaCodeFromZipService,
    services.logger,
  )
  // Derive state from ZIP when stateCode is missing to avoid defaulting to P2P_JOB_DEFAULTS.DID_STATE
  const stateFromZip =
    stateCode == null && zip ? zipcodes.lookup(zip)?.state : undefined
  const didState = stateCode ?? stateFromZip ?? P2P_JOB_DEFAULTS.DID_STATE
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
          postalCodeValue: postalCode?.long_name,
        },
        { areaCodeFromZipService, logger },
      )
    } catch (err) {
      logger?.warn('Failed to resolve placeId geography', {
        err,
        placeId: campaign.placeId,
      })
    }
  }

  // 2) Fallback to campaign.details (and zip lookup for state)
  const zip = normalizeZip(details?.zip)
  const stateCode =
    details?.state?.trim() ?? (zip ? zipcodes.lookup(zip)?.state : undefined)

  return resolveJobGeographyFromAddress(
    { stateCode, postalCodeValue: zip },
    { areaCodeFromZipService, logger },
  )
}
