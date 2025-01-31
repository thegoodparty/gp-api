import { checkOfficeLevelValue } from './checkOfficeLevelValue.util'

export function sortRacesByLevel(a, b) {
  const aLevel = checkOfficeLevelValue(a.position?.level)
  const bLevel = checkOfficeLevelValue(b.position?.level)
  return aLevel - bLevel
}

export const sortRacesGroupedByYear = (elections = {}) => {
  const electionYears = Object.keys(elections)
  return electionYears.reduce((aggregate, electionYear) => {
    const electionsSortedByYear = elections[electionYear].sort(sortRacesByLevel)
    return {
      ...aggregate,
      [electionYear]: electionsSortedByYear,
    }
  }, {})
}
