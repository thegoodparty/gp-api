import { PageInfo, PositionLevel } from 'src/generated/graphql.types'
import { BDElection } from './ballotData.types'

export type RacesByZipcode = {
  races: {
    edges: RaceEdge[]
    pageInfo: PageInfo
  }
}

type RaceEdge = {
  node: RaceNode
}

export type RaceNode = {
  id: string
  isPrimary: boolean
  filingPeriods: FilingPeriod[]
  election: Election | BDElection
  position: Position
}

type FilingPeriod = {
  startOn: string
  endOn: string
}

type Election = {
  id: string
  electionDay: string
  name: string
  originalElectionDate: string
  state: string
  timezone: string
}

type PartisanType = 'partisan' | 'nonpartisan'

type Position = {
  id: string
  appointed: false
  hasPrimary: true
  partisanType: PartisanType
  level: PositionLevel
  name: string
  salary: string
  state: string
  subAreaName: string
  subAreaValue: string
  electionFrequencies: ElectionFrequency[]
}

type ElectionFrequency = {
  frequency: number[]
}
