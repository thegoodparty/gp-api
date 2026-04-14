export interface ViabilityScore {
  level: string
  isPartisan: boolean
  isIncumbent: boolean
  isUncontested: boolean
  candidates: number
  seats: number
  candidatesPerSeat: number
  score: number
  probOfWin: number
}

export enum P2VSource {
  ElectionApi = 'ElectionApi',
}
