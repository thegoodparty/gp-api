import { County, LevelType, Municipality, Race } from '@prisma/client'

export interface NormalizedRace
  extends Omit<Race, 'electionDate' | 'municipality' | 'county' | 'data'> {
  positionName?: string
  electionDate?: string
  date?: string
  electionName?: string
  level: LevelType
  partisanType?: string
  salary?: string
  employmentType?: string
  filingDateStart?: string
  filingDateEnd?: string
  frequency?: number[]
  normalizedPositionName?: string
  positionDescription?: string
  // subAreaName?: string
  // subAreaValue?: string
  filingOfficeAddress?: string
  filingPhoneNumber?: string
  paperworkInstructions?: string
  filingRequirements?: string
  eligibilityRequirements?: string
  isRunoff?: boolean
  isPrimary?: boolean
  municipality?: Pick<Municipality, 'name' | 'slug'> | null
  county?: Pick<County, 'name' | 'slug'> | null
}

export type RaceQuery = {
  state: string
  positionSlug: string
  electionDate: {
    gte: Date
    lt: Date
  }
  municipalityId?: number
  countyId?: number
}

export type GeoData = {
  name: string
  type: string
  city?: string
  county?: string
  state?: string
  township?: string
  town?: string
  village?: string
  borough?: string
}

export enum OfficeLevel {
  FEDERAL = 10,
  STATE = 8,
  COUNTY = 6,
  CITY = 4,
  LOCAL = 0,
  DEFAULT = 12,
}

export type MunicipalityResponse = Pick<
  Municipality,
  'id' | 'slug' | 'name'
> & {
  openElections?: number
  state?: string
}
export type ProximityCitiesResponseBody = {
  cities: MunicipalityResponse[]
  parsed?: string[]
}
