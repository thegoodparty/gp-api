export enum P2VStatus {
  complete = 'Complete',
  waiting = 'Waiting',
  failed = 'Failed',
  districtMatched = 'DistrictMatched',
}

// This is only for Hubspot
export const P2V_LOCKED_STATUS = 'Locked' as const
