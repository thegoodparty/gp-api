import { LevelType } from '@prisma/client'

export {}

declare global {
  export namespace PrismaJson {
    export type MunicipalityData = {
      population?: string
      density?: string
      income_household_median?: string
      unemployment_rate?: string
      home_value?: string
      county_name?: string
      city?: string
    }

    export type CountyData = {
      county_full?: string
      city_largest?: string
      population?: string
      density?: string
      income_household_median?: string
      unemployment_rate?: string
      home_value?: string
      county?: string
      city?: string
      state_id?: string
      county_name?: string
      township?: string
      incorporated?: string
    }

    export type RaceData = {
      id?: number
      race_id?: number
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
      frequency?: number[]
      reference_year?: number
      salary?: string
      employment_type?: string
      filing_office_address?: string
      filing_phone_number?: string
      paperwork_instructions?: string
      filing_requirements?: string
      eligibility_requirements?: string
      partisan_type?: string
      filing_periods?: {
        notes?: string | null
        end_on?: string
        start_on?: string
      }[]
      race_created_at?: string
      race_updated_at?: string
      filing_date_start?: string
      filing_date_end?: string
    }
  }
}
