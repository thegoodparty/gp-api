import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import {
  PeerlyLocalities,
  PEERLY_LOCALITY_CATEGORIES,
} from '../services/peerly.const'

export const getPeerlyLocaleFromBallotLevel = (
  ballotLevel: BallotReadyPositionLevel,
) =>
  Object.values(PeerlyLocalities).find((locality) =>
    PEERLY_LOCALITY_CATEGORIES[locality].includes(ballotLevel),
  )
