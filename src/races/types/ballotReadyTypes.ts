import { PageInfo, PositionLevel } from 'src/generated/graphql.types'

export type RacesByZipcode = {
  races: {
    edges: RacesByZipcodeNode[]
    pageInfo: PageInfo
  }
}

type RacesByZipcodeNode = {
  node: {
    id: string
    isPrimary: boolean
    filingPeriods: FilingPeriod[]
    election: Election
    position: Position
  }
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

type Position = {
  id: string
  appointed: false
  hasPrimary: true
  partisanType: string
  level: PositionLevel
  name: string
  salary: string
  state: string
  subAreaName: string
  subAreaValue: string
  electionFrequencies: ElectionFrequency
}

type ElectionFrequency = {
  frequency: number[]
}
