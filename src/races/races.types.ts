import {
  County,
  LevelType,
  Municipality,
  Race as PrismaRace,
} from '@prisma/client'

export type RaceData = {
  id?: number
  race_id: number
  geofence_id?: number
  is_primary?: boolean
  is_runoff?: boolean
  is_unexpired?: boolean
  election_id?: number
  election_name?: string
  election_day?: string
  position_id?: number
  mtfcc?: string
  geo_id?: number
  position_name?: string
  sub_area_name?: string
  sub_area_value?: string
  sub_area_name_secondary?: string
  sub_area_value_secondary?: string
  state?: string
  level: LevelType
  tier?: number
  is_judicial?: boolean
  is_retention?: boolean
  number_of_seats?: number
  has_blanket_primary?: boolean
  has_majority_vote_primary?: boolean
  normalized_position_id?: number
  normalized_position_name?: string
  position_description?: string
  frequency: number[]
  reference_year?: number
  salary?: string
  employment_type?: string
  filing_office_address?: string
  filing_phone_number?: string
  paperwork_instructions?: string
  filing_requirements?: string
  eligibility_requirements?: string
  partisan_type?: string
  filing_periods: {
    notes?: string | null
    end_on?: string
    start_on?: string
  }[]
  race_created_at?: string
  race_updated_at?: string
  filing_date_start?: string
  filing_date_end?: string
}

export interface Race extends PrismaRace {
  data: RaceData
  municipality?: Municipality | null
  county?: County | null
}

// = Omit<PrismaRace, 'data'> & {
//   data?: RaceData | null
//   municipality?: Municipality | null | undefined
//   county?: County | null | undefined
// }

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
  frequency: number[]
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
