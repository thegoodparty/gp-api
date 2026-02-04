import { Campaign, PathToVictory } from '@prisma/client'

export type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

export type DistrictStatsBucket = {
  label: string
  count: number
  percent: number
}

export type DistrictStatSummary = {
  buckets: DistrictStatsBucket[]
}

export type StatsResponse = {
  districtId: string
  computedAt: string
  totalConstituents: number
  totalConstituentsWithCellPhone: number
  buckets: {
    age: DistrictStatSummary
    homeowner: DistrictStatSummary
    education: DistrictStatSummary
    presenceOfChildren: DistrictStatSummary
    estimatedIncomeRange: DistrictStatSummary
  }
}

export enum ConstituentActivityType {
  POLL_INTERACTIONS,
}

export enum ConstituentActivityEventType {
  SENT,
  RESPONDED,
  OPTED_OUT,
}

type ConstituentActivityEvent = {
  type: ConstituentActivityEventType
  date: string
}

type ConstituentActivity = {
  type: ConstituentActivityType
  date: string
  data: {
    pollId: string
    pollTitle: string
    events: ConstituentActivityEvent[]
  }
}

export type GetIndividualActivitiesResponse = {
  nextCursor: string | null
  results: ConstituentActivity[]
}
