import type { P2VSource, P2VStatus } from './enums'

export type ViabilityScore = {
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

export type PathToVictoryData = {
  p2vStatus?: P2VStatus
  p2vAttempts?: number
  p2vCompleteDate?: string
  completedBy?: number
  electionType?: string
  electionLocation?: string
  voterContactGoal?: number
  winNumber?: number
  p2vNotNeeded?: boolean
  totalRegisteredVoters?: number
  republicans?: number
  democrats?: number
  indies?: number
  women?: number
  men?: number
  white?: number
  asian?: number
  africanAmerican?: number
  hispanic?: number
  averageTurnout?: number
  projectedTurnout?: number
  viability?: ViabilityScore
  source?: P2VSource
  districtId?: string
  districtManuallySet?: boolean
  officeContextFingerprint?: string
}

export type PathToVictory = {
  id: number
  createdAt: string
  updatedAt: string
  campaignId: number
  data: PathToVictoryData
}
