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

enum ElectionCode {
  EP, // Primary Election
  EG, // General Election
  EPP, // Presidential Preference Primary
  ECP, // Consolidated Primary Election
  ECG, // Consolidated General Election
  EL, // Local Election
  ES, // Special Election
  ER, // Runoff Election
  EPD, // Democratic Election Primary
}

export type ProjectedTurnout = {
  id: string
  brPositionId: string
  createdAt: Date
  updatedAt: Date
  geoid: string
  state: string
  L2DistrictType: string
  L2DistrictName: string
  year: number
  electionCode: ElectionCode
  projectedTurnout: number
  inferenceDate: Date
  modelVersion: string
}
