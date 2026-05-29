import type { RaceTargetMetrics } from '@goodparty_org/contracts'
export type { RaceTargetMetrics } from '@goodparty_org/contracts'

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

/**
 * District-only race target calculation result. Does NOT include filing fee
 * fields — those only come from the position lookup path. Callers using this
 * (e.g. `buildRaceTargetDetails`) must default filingFee/filingRequirementsText
 * to null themselves when assembling the final `RaceTargetMetrics`.
 */
export type RaceTargetDetailsResult = Pick<
  RaceTargetMetrics,
  'winNumber' | 'voterContactGoal' | 'projectedTurnout'
>

export type VoterIssue = {
  label: string
  score: number
  priority: 'high' | 'medium' | 'low'
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

export type DistrictTypeItem = {
  id: string
  L2DistrictType: string
}

export type DistrictNameItem = {
  id: string
  L2DistrictName: string
}

interface DistrictInfo {
  state: string
  L2DistrictType: string
  L2DistrictName: string
}

interface DistrictIdInfo {
  districtId: string
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

export type BuildRaceTargetDetailsInput = (DistrictInfo | DistrictIdInfo) &
  (ByDate | ByYearAndCode)

export type District = {
  id: string
  state: string
  L2DistrictType: string
  L2DistrictName: string
  projectedTurnout: SourceProjectedTurnout | null
}

export type PositionWithOptionalDistrict = {
  id: string
  brPositionId: string
  brDatabaseId: string
  state: string
  name: string
  district?: District
  filingFee?: number | null
  filingRequirementsText?: string | null
  filingFeeExtractionSource?: string | null
}

/**
 * Shape returned by election-api `GET /races/by-br-hash-id/:hashId/filing-fee`.
 * Mirrors `FilingFeeResult` on the election-api side so the shapes stay
 * aligned. `extractionSource` is informational (audit / debugging) and not
 * surfaced to clients today.
 */
export type FilingFeeByBrHashResult = {
  filingFee: number | null
  filingRequirementsText: string | null
  extractionSource: string | null
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
