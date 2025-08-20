import { BallotReadyPositionLevel } from '../../campaigns/campaigns.types'

export const PEERLY_ENTITY_TYPE = 'NON_PROFIT'
export const PEERLY_USECASE = 'POLITICAL'

export enum PEERLY_LOCALITIES {
  local = 'local',
  state = 'state',
}

export const PEERLY_LOCALITY_CATEGORIES = {
  [PEERLY_LOCALITIES.local]: [
    BallotReadyPositionLevel.CITY,
    BallotReadyPositionLevel.COUNTY,
    BallotReadyPositionLevel.LOCAL,
    BallotReadyPositionLevel.REGIONAL,
    BallotReadyPositionLevel.TOWNSHIP,
  ],
  [PEERLY_LOCALITIES.state]: [BallotReadyPositionLevel.STATE],
}
