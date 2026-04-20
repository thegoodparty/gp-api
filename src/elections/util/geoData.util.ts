import { GEO_TYPES, MTFCC_TYPES } from '../constants/geo.consts'
import { GeoData } from '../types/elections.types'

export function censusRowToGeoData(census: {
  mtfccType: string
  name: string
}): GeoData {
  const geoData: GeoData = {
    name: census.name,
    type: census.mtfccType,
  }

  // todo: this can be improved for county recognition
  // and other types of entities (school board, etc)
  if (census.mtfccType === MTFCC_TYPES.CITY) {
    geoData.city = census.name
  } else if (census.mtfccType === MTFCC_TYPES.COUNTY) {
    // todo: strip County from name.
    geoData.county = census.name
  } else if (census.mtfccType === MTFCC_TYPES.STATE) {
    geoData.state = census.name
  } else if (census.mtfccType === MTFCC_TYPES.COUNTY_SUBDIVISION) {
    const lower = census.name.toLowerCase()
    if (lower.includes(GEO_TYPES.TOWNSHIP)) {
      geoData.township = census.name
    } else if (lower.includes(GEO_TYPES.TOWN)) {
      geoData.town = census.name
    } else if (lower.includes(GEO_TYPES.CITY)) {
      geoData.city = census.name
    } else if (lower.includes(GEO_TYPES.VILLAGE)) {
      geoData.village = census.name
    } else if (lower.includes(GEO_TYPES.BOROUGH)) {
      geoData.borough = census.name
    }
  }

  return geoData
}

export function extractCityFromGeoData(
  geoData: GeoData | undefined,
): string | null {
  if (!geoData) return null
  const raw =
    geoData.borough ||
    geoData.village ||
    geoData.town ||
    geoData.township ||
    geoData.city ||
    null
  if (!raw) return null
  // Note: we don't remove Town/Township/Village/Borough
  // because we want to keep that info for ai column matching.
  return raw.replace(/ CCD$/, '').replace(/ City$/, '')
}
