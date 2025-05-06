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

export type PrimaryElectionDates = {
  [key: string]: {
    electionDay: string
    primaryElectionId: string
  }
}

export type GeoData = {
  name: string
  type: string
  city?: string
  county?: string
  state?: string
  township?: string
  town?: string
  village?: string
  borough?: string
}

export enum OfficeLevel {
  FEDERAL = 10,
  STATE = 8,
  COUNTY = 6,
  CITY = 4,
  LOCAL = 0,
  DEFAULT = 12,
}
