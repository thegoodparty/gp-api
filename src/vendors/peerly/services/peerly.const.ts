import { OfficeLevel } from '@prisma/client'
import { BallotReadyPositionLevel } from '../../../campaigns/campaigns.types'

export const PEERLY_ENTITY_TYPE = 'NON_PROFIT'
export const PEERLY_USECASE = 'POLITICAL'

export enum PEERLY_LOCALITIES {
  local = 'local',
  state = 'state',
  federal = 'federal',
}

export const getPeerlyLocaleFromOfficeLevel = (
  officeLevel: OfficeLevel,
): PEERLY_LOCALITIES => {
  switch (officeLevel) {
    case OfficeLevel.federal:
      return PEERLY_LOCALITIES.federal
    case OfficeLevel.state:
      return PEERLY_LOCALITIES.state
    case OfficeLevel.local:
      return PEERLY_LOCALITIES.local
  }
}

export const PEERLY_LOCALITY_CATEGORIES: Record<
  PEERLY_LOCALITIES,
  BallotReadyPositionLevel[]
> = {
  [PEERLY_LOCALITIES.local]: [
    BallotReadyPositionLevel.CITY,
    BallotReadyPositionLevel.COUNTY,
    BallotReadyPositionLevel.LOCAL,
    BallotReadyPositionLevel.REGIONAL,
    BallotReadyPositionLevel.TOWNSHIP,
  ],
  [PEERLY_LOCALITIES.state]: [BallotReadyPositionLevel.STATE],
  [PEERLY_LOCALITIES.federal]: [BallotReadyPositionLevel.FEDERAL],
}
