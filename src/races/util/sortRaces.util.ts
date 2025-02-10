import { RacesByYear } from '../types/ballotData.types'
import { RaceNode } from '../types/ballotReady.types'
import { getOfficeLevelValue } from './getOfficeLevelValue.util'

export function sortRacesByLevel(a: RaceNode, b: RaceNode): number {
  const aLevel = getOfficeLevelValue(a.position?.level)
  const bLevel = getOfficeLevelValue(b.position?.level)
  return aLevel - bLevel
}

export const sortRacesGroupedByYear = (
  elections: RacesByYear = {},
): RacesByYear => {
  const electionYears = Object.keys(elections)
  return electionYears.reduce((aggregate, electionYear) => {
    const electionsSortedByYear = elections[electionYear].sort(sortRacesByLevel)
    return {
      ...aggregate,
      [electionYear]: electionsSortedByYear,
    }
  }, {})
}
