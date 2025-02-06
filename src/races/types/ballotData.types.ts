import { RaceNode } from './ballotReady.types'

export type BDElection = {
  id: string
  electionDay: string
  name: string
  originalElectionDate: string
  state: string
  timezone: string
  primaryElectionDate?: string
  primaryElectionId?: string
}

export type RacesByYear = {
  [key: string]: RaceNode[]
}
