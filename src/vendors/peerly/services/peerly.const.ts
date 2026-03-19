import { CommitteeType, OfficeLevel } from '@prisma/client'
import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import { PeerlyCommitteeType } from '../peerly.types'

export const PEERLY_ENTITY_TYPE = 'NON_PROFIT'
export const PEERLY_USECASE = 'POLITICAL'

export enum PeerlyLocalities {
  local = 'local',
  state = 'state',
  federal = 'federal',
}

export const getPeerlyLocaleFromOfficeLevel = (
  officeLevel: OfficeLevel,
): PeerlyLocalities => {
  switch (officeLevel) {
    case OfficeLevel.federal:
      return PeerlyLocalities.federal
    case OfficeLevel.state:
      return PeerlyLocalities.state
    case OfficeLevel.local:
      return PeerlyLocalities.local
  }
}

export const getPeerlyCommitteeType = (
  committeeType: CommitteeType,
): PeerlyCommitteeType => {
  switch (committeeType) {
    case CommitteeType.HOUSE:
      return PeerlyCommitteeType.House
    case CommitteeType.SENATE:
      return PeerlyCommitteeType.Senate
    case CommitteeType.PRESIDENTIAL:
      return PeerlyCommitteeType.Presidential
    case CommitteeType.CANDIDATE:
      return PeerlyCommitteeType.Candidate
  }
}

export const PEERLY_LOCALITY_CATEGORIES: Record<
  PeerlyLocalities,
  BallotReadyPositionLevel[]
> = {
  [PeerlyLocalities.local]: [
    BallotReadyPositionLevel.CITY,
    BallotReadyPositionLevel.COUNTY,
    BallotReadyPositionLevel.LOCAL,
    BallotReadyPositionLevel.REGIONAL,
    BallotReadyPositionLevel.TOWNSHIP,
  ],
  [PeerlyLocalities.state]: [BallotReadyPositionLevel.STATE],
  [PeerlyLocalities.federal]: [BallotReadyPositionLevel.FEDERAL],
}
