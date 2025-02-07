import { Election, PageInfo, Position } from 'src/generated/graphql.types'
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
  election: RacesByZipcodeElection | BDElection
  position: RacesByZipcodePosition
}

type FilingPeriod = {
  startOn: string
  endOn: string
}

type RacesByZipcodeElection = Pick<
  Election,
  'id' | 'electionDay' | 'name' | 'originalElectionDate' | 'state' | 'timezone'
>

type RacesByZipcodePosition = Pick<
  Position,
  | 'id'
  | 'appointed'
  | 'hasPrimary'
  | 'partisanType'
  | 'level'
  | 'name'
  | 'salary'
  | 'state'
  | 'subAreaName'
  | 'subAreaValue'
  | 'electionFrequencies'
>

// type Position = {
//   id: string
//   appointed: false
//   hasPrimary: true
//   partisanType: PartisanType
//   level: PositionLevel
//   name: string
//   salary: string
//   state: string
//   subAreaName: string
//   subAreaValue: string
//   electionFrequencies: ElectionFrequency[]
// }

// type ElectionFrequency = {
//   frequency: number[]
// }

type BasicRaceEdge = {
  node: BasicRaceNode[]
}

type BasicRaceNode = {
  position: Pick<Position, 'name'>
  election: Pick<Election, 'electionDay'>
}

export type RacesWithElectionDates = {
  races: {
    edges: BasicRaceEdge[]
    pageInfo: PageInfo
  }
}

export type RacesById = {
  races: {
    edges: RacesByIdEdge[]
  }
}

type RacesByIdEdge = {
  node: RacesByIdNode
}

type RacesByIdNode = {
  databaseId: string
  isPartisan: boolean
  isPrimary: boolean
  filingPeriods: FilingPeriod[]
  election: RacesByIdElection
  position: RacesByIdPosition
}

type RacesByIdElection = Pick<Election, 'electionDay' | 'name' | 'state'>

type RacesByIdPosition = Pick<
  Position,
  | 'id'
  | 'description'
  | 'judicial'
  | 'level'
  | 'name'
  | 'partisanType'
  | 'staggeredTerm'
  | 'state'
  | 'subAreaName'
  | 'subAreaValue'
  | 'tier'
  | 'mtfcc'
  | 'geoId'
  | 'electionFrequencies'
  | 'hasPrimary'
>
