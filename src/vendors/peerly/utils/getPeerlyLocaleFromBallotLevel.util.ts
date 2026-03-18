import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import {
  PEERLY_LOCALITIES,
  PEERLY_LOCALITY_CATEGORIES,
} from '../services/peerly.const'

export const getPeerlyLocaleFromBallotLevel = (
  ballotLevel: BallotReadyPositionLevel,
) =>
  Object.values(PEERLY_LOCALITIES).find((locality) =>
    PEERLY_LOCALITY_CATEGORIES[locality].includes(ballotLevel),
  )
