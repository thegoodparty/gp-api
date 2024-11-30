import { Race as PrismaRace } from '@prisma/client'

export type RaceData = {
  position_name?: string
  state?: string
  race_id?: number
  is_primary?: boolean
  is_judicial?: boolean
  sub_area_name?: string
  sub_area_value?: string
  filing_periods?: string
  election_day?: string
  normalized_position_name?: string
  level?: string
  filing_date_end?: string
  filing_date_start?: string
  election_name?: string
  partisan_type?: string
  salary?: string
  employment_type?: string
  position_description?: string
  frequency?: string
  filing_office_address?: string
  filing_phone_number?: string
  paperwork_instructions?: string
  filing_requirements?: string
  eligibility_requirements?: string
  is_runoff?: boolean
}

export type Race = Omit<PrismaRace, 'data'> & {
  data?: RaceData | null
}

export type ExtendedRace = Race & {
  municipality?: any
  county?: any
}

export type NormalizedRace = {
  hashId?: string
  positionName?: string
  electionDate?: string
  electionName?: string
  state?: string
  level?: string
  partisanType?: string
  salary?: string
  employmentType?: string
  filingDateStart?: string
  filingDateEnd?: string
  normalizedPositionName?: string
  positionDescription?: string
  frequency?: string
  subAreaName?: string
  subAreaValue?: string
  filingOfficeAddress?: string
  filingPhoneNumber?: string
  paperworkInstructions?: string
  filingRequirements?: string
  eligibilityRequirements?: string
  isRunoff?: boolean
  isPrimary?: boolean
  municipality?: {
    name: string
    slug: string
  } | null
  county?: {
    name: string
    slug: string
  } | null
}
