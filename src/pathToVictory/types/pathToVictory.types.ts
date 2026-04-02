import { QueueType } from 'src/queue/queue.types'

/**
 * Fields formerly stored on PathToVictoryData, now served live from the
 * election API. May still exist in historical DB rows.
 */
export type LegacyPathToVictoryFields = {
  projectedTurnout?: number
  winNumber?: number
  voterContactGoal?: number
  electionType?: string
  electionLocation?: string
  districtId?: string
  districtManuallySet?: boolean
}

/**
 * PathToVictoryData as it may appear in historical DB rows — includes
 * fields that are no longer actively written but may still exist.
 */
export type PathToVictoryDataWithLegacy = PrismaJson.PathToVictoryData &
  LegacyPathToVictoryFields

export interface PathToVictoryQueueMessage {
  type: QueueType.PATH_TO_VICTORY
  data: PathToVictoryInput
}

export interface PathToVictoryInput {
  slug: string
  campaignId: string
  officeName: string
  electionDate: string
  electionTerm: number
  electionLevel: string
  electionState: string
  electionCounty?: string
  electionMunicipality?: string
  subAreaName?: string
  subAreaValue?: string
  partisanType: string
  priorElectionDates: string[]
  positionId?: string
  electionType?: string
  electionLocation?: string
}

export type P2VCounts = {
  projectedTurnout: number
  winNumber: number
  voterContactGoal: number
}

export interface PathToVictoryResponse {
  electionType: string
  electionLocation: string
  district: string
  counts: P2VCounts
}

export interface L2Count {
  electionType: string
  electionLocation: string
  electionDistrict: string
  counts: P2VCounts
}

export interface ViabilityScore {
  level: string
  isPartisan: boolean
  isIncumbent: boolean
  isUncontested: boolean
  candidates: number
  seats: number
  candidatesPerSeat: number
  score: number
  probOfWin: number
}

export enum P2VSource {
  GpApi = 'GpApi',
  ElectionApi = 'ElectionApi',
}
