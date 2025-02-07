import { Election, PageInfo, Position } from 'src/generated/graphql.types'
import { BDElection } from './ballotData.types'

// -----------------------------
// Shared/Generic Types
// -----------------------------

export interface PaginatedResponse<T> {
  edges: { node: T }[]
  pageInfo: PageInfo
}

export interface FilingPeriod {
  startOn: string
  endOn: string
}

// -----------------------------
// Races By Zipcode Types
// -----------------------------

export interface RacesByZipcode {
  races: PaginatedResponse<RaceNode>
}

export interface RaceNode {
  id: string
  isPrimary: boolean
  filingPeriods: FilingPeriod[]
  election: RacesByZipcodeElection | BDElection
  position: RacesByZipcodePosition
}

export type RacesByZipcodeElection = Pick<
  Election,
  'id' | 'electionDay' | 'name' | 'originalElectionDate' | 'state' | 'timezone'
>

export type RacesByZipcodePosition = Pick<
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

// -----------------------------
// Races With Election Dates Types
// -----------------------------

interface BasicRaceNode {
  position: Pick<Position, 'name'>
  election: Pick<Election, 'electionDay'>
}

interface BasicRaceEdge {
  node: BasicRaceNode
}

export interface RacesWithElectionDates {
  races: PaginatedResponse<BasicRaceEdge>
}

// -----------------------------
// Races By Id Types
// -----------------------------

export interface RacesById {
  races: PaginatedResponse<RacesByIdEdge>
}

interface RacesByIdEdge {
  node: RacesByIdNode
}

interface RacesByIdNode {
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
