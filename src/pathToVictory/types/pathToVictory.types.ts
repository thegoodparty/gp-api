import { QueueType } from 'src/queue/queue.types'

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
