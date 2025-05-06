import { OfficeLevel } from '../types/elections.types'

// TODO: Implement new level function and enum across the race service
// Make sure this works
export function getOfficeLevelValue(level: string): number {
  return OfficeLevel[level as keyof typeof OfficeLevel] ?? OfficeLevel.DEFAULT
}
