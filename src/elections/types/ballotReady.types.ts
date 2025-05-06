import { Election, PageInfo, Position } from 'src/generated/graphql.types'
import { BDElection } from './elections.types'

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

export interface RacesByZipcodeElection
  extends Pick<
    Election,
    | 'id'
    | 'electionDay'
    | 'name'
    | 'originalElectionDate'
    | 'state'
    | 'timezone'
  > {
  primaryElectionDate?: string
  primaryElectionId?: string
}

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

export interface RacesWithElectionDates {
  races: PaginatedResponse<BasicRaceNode>
}

// -----------------------------
// Races By Id Types
// -----------------------------

export interface RacesByIdNode {
  node: {
    databaseId: string
    isPartisan: boolean
    isPrimary: boolean
    filingPeriods: FilingPeriod[]
    election: RacesByIdElection
    position: RacesByIdPosition
    normalizedPosition: Record<string, string>
  }
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

// -----------------------------
// Race With Office Holders Types
// -----------------------------

export interface RaceWithOfficeHolders {
  node: RaceWithOfficeHoldersNode
}

export interface RaceWithOfficeHoldersNode {
  databaseId: string
  isPartisan: boolean
  isPrimary: boolean
  election: RacesByIdElection
  position: PositionWithOfficeHolders
  filingPeriods: FilingPeriod[]
  candidacies: Candidacy[]
}

interface PositionWithOfficeHolders extends RacesByIdPosition {
  seats: number
  officeHolders: {
    nodes: OfficeHolder[]
  }
}

interface OfficeHolder {
  centralPhone: string | null
  createdAt: string
  databaseId: string
  endAt: string | null
  id: string
  isAppointed: boolean
  isCurrent: boolean
  isOffCycle: boolean
  isVacant: boolean
  officePhone: string | null
  officeTitle: string | null
  otherPhone: string | null
  primaryEmail: string | null
  specificity: string
  startAt: string
  totalYearsInOffice: number
  updatedAt: string
  person: Person
}

interface Person {
  createdAt: string
  databaseId: string
  email: string | null
  firstName: string
  fullName: string
  id: string
  lastName: string
  middleName: string | null
  nickname: string | null
  phone: string | null
  slug: string
  suffix: string | null
  updatedAt: string
}

interface Candidacy {
  createdAt: string
  databaseId: string
  id: string
  isCertified: boolean
  isHidden: boolean
  result: string | null
  uncertified: boolean
  updatedAt: string
  withdrawn: boolean
  candidate: Person
  election: {
    electionDay: string
  }
}
