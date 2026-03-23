export enum ElectionLevels {
  Local = 'LOCAL',
  City = 'CITY',
  County = 'COUNTY',
  State = 'STATE',
  Federal = 'FEDERAL',
}
// String to enum narrowing — GraphQL returns string, runtime validation would add overhead
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
export const LEVELS = Object.values(ElectionLevels) as [string, ...string[]]
