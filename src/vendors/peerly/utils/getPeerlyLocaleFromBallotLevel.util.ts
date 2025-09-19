import { BallotReadyPositionLevel } from '../../../campaigns/campaigns.types'
import { PEERLY_LOCALITY_CATEGORIES } from '../services/peerly.const'

export const getPeerlyLocaleFromBallotLevel = (
  ballotLevel: BallotReadyPositionLevel,
) =>
  Object.keys(PEERLY_LOCALITY_CATEGORIES).find((key) =>
    PEERLY_LOCALITY_CATEGORIES[key].includes(ballotLevel),
  )
