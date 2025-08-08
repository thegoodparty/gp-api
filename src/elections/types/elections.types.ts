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

export enum ElectionCode {
  // Should directly reflect ElectionCode in election-api/prisma/schema/projectedTurnout.prisma
  General = 'General',
  LocalOrMunicipal = 'LocalOrMunicipal',
  ConsolidatedGeneral = 'ConsolidatedGeneral',
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

export type RaceTargetMetrics = {
  winNumber: number
  voterContactGoal: number
  projectedTurnout: number
}

export enum ProjectedTurnoutSourceColumns {
  id = 'id',
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  electionYear = 'electionYear',
  electionCode = 'electionCode',
  projectedTurnout = 'projectedTurnout',
  inferenceAt = 'inferenceAt',
  modelVersion = 'modelVersion',
  districtId = 'districtId',
}

export enum DistrictSourceColumns {
  id = 'id',
  createdAt = 'createdAt',
  updatedAt = 'updatedAt',
  state = 'state',
  L2DistrictType = 'L2DistrictType',
  L2DistrictName = 'L2DistrictName',
}

interface DistrictInfo {
  state: string
  L2DistrictType: string
  L2DistrictName: string
}

interface ByDate {
  electionDate: string
  electionYear?: never
  electionCode?: never
}

interface ByYearAndCode {
  electionDate?: never
  electionYear: string
  electionCode: string
}

export type BuildRaceTargetDetailsInput = DistrictInfo &
  (ByDate | ByYearAndCode)

export type PositionWithMatchedDistrict = {
  positionId: string
  brPositionId: string
  brDatabaseId: string
  district: {
    id: string
    L2DistrictType: string
    L2DistrictName: string
    projectedTurnout: SourceProjectedTurnout
  }
}

type SourceProjectedTurnout = {
  id: string
  createdAt: Date
  updatedAt: Date
  electionYear: number
  electionCode: ElectionCode
  projectedTurnout: number
  inferenceAt: Date
  modelVersion: string
  districtId: string
}
