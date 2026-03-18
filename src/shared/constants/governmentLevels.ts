export enum ElectionLevels {
  Local = 'LOCAL',
  City = 'CITY',
  County = 'COUNTY',
  State = 'STATE',
  Federal = 'FEDERAL',
}
export const LEVELS = Object.values(ElectionLevels) as [string, ...string[]]
