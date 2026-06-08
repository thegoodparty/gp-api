import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import { VoterIssueLevel } from '../types/elections.types'

// Collapse BallotReady's 7 position levels onto the 4 jurisdictional levels
// the election-api voter-issues filter understands. Mirrors the DATA-1903
// flag intent: municipal offices act on local issues, county/regional offices
// on regional issues.
const LEVEL_MAP: Record<BallotReadyPositionLevel, VoterIssueLevel> = {
  CITY: 'local',
  TOWNSHIP: 'local',
  LOCAL: 'local',
  COUNTY: 'regional',
  REGIONAL: 'regional',
  STATE: 'state',
  FEDERAL: 'federal',
}

export const getVoterIssueLevelFromPositionLevel = (
  level: BallotReadyPositionLevel | null | undefined,
): VoterIssueLevel | null => (level ? LEVEL_MAP[level] : null)
