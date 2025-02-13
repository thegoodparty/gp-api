import { P2VStatus } from 'src/races/types/pathToVictory.types'

export {}

interface P2VViability {
  level?: string
  score?: number
  seats?: number
  opponents?: number
  candidates?: number
  isPartisan?: boolean
  isIncumbent?: boolean
  isUncontested?: string
  candidatesPerSeat?: number
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
      viability?: P2VViability
    }
  }
}
