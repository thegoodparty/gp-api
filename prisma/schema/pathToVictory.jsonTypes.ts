import { P2VStatus } from 'src/races/types/pathToVictory.types'

export {}

declare global {
  export namespace PrismaJson {
    export type PathToVictoryData = {
      p2vStatus?: P2VStatus
      p2vCompleteDate?: string
      completedBy?: number
      electionType?: string
      electionLocation?: string
      voterContactGoal?: number
    }
  }
}
