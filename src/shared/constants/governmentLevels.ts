export enum ELECTION_LEVELS {
  Local = 'LOCAL',
  City = 'CITY',
  County = 'COUNTY',
  State = 'STATE',
  Federal = 'FEDERAL',
}
export const LEVELS = Object.values(ELECTION_LEVELS) as [string, ...string[]]
