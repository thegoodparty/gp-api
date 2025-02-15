export type VoterHistoryColumn = {
  column: string
  type: string
  date?: string
}

export type VoterCounts = Partial<TurnoutCounts> &
  Partial<PartisanCounts> &
  Partial<GenderCounts> &
  Partial<EthnicityCounts> & {
    foundColumns?: VoterHistoryColumn[]
  }

export type TurnoutCounts = {
  averageTurnout: number
  averageTurnoutPercent: string
  projectedTurnout: number
  projectedTurnoutPercent: string
  winNumber: number
  voterContactGoal: number
}

export type PartisanCounts = {
  total: number
  democrat: number
  republican: number
  independent: number
}

export type GenderCounts = {
  men: number
  women: number
}

export type EthnicityCounts = {
  white: number
  asian: number
  hispanic: number
  africanAmerican: number
}
