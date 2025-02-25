import { P2VStatus } from 'src/elections/types/pathToVictory.types'

export {}

// we allow for '' empty string which means the data is not yet available
interface P2VViability {
  level?: string
  score?: number
  seats?: string | number
  opponents?: string | number
  candidates?: string | number
  isPartisan?: string | boolean
  isIncumbent?: string | boolean
  isUncontested?: string | boolean
  candidatesPerSeat?: string | number
}

declare global {
  export namespace PrismaJson {
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
      viability?: P2VViability
    }
  }
}
