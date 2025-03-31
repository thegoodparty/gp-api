import { VoterCounts } from 'src/voters/voters.types'

export interface PathToVictoryQueueMessage {
  type: 'pathToVictory'
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

export interface PathToVictoryResponse {
  electionType: string
  electionLocation: string
  district: string
  counts: VoterCounts
}

export interface L2Count {
  electionType: string
  electionLocation: string
  electionDistrict: string
  counts: VoterCounts
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
