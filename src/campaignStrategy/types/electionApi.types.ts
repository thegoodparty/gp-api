// Shape election-api returns on the campaign-strategy-context endpoint. Most
// fields are nullable per the contract — first/last/full name on candidates
// are the only guaranteed strings on the candidate, and every field on the
// race is independently nullable.
export interface ApiCandidate {
  gpCandidateId: string | null
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  websiteUrl: string | null
  party: string | null
  isIncumbent: boolean | null
}

export interface RaceContextFromApi {
  state: string | null
  candidateOffice: string | null
  officialOfficeName: string | null
  officeLevel: string | null
  officeType: string | null
  primaryElectionDate: string | null
  generalElectionDate: string | null
  relevantElectionDate: string | null
  numberOfSeats: number | null
  projectedTurnout: number | null
  civicsWinNumber: number | null
  winNumberEstimate: number | null
  winNumberEffective: number | null
  contactsNeededEstimate: number | null
  candidateCount: number
  candidates: ApiCandidate[]
}

// What the prompts consume: the API response + gp-api-stitched fields.
// isUser is set by matching candidate identity against the requesting user.
export interface RaceCandidate extends ApiCandidate {
  isUser: boolean
}

export interface RaceContext extends Omit<RaceContextFromApi, 'candidates'> {
  userFullName: string
  userPartyAffiliation: string
  candidates: RaceCandidate[]
}
