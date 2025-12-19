import { Campaign, PathToVictory, VoterFileFilter } from '@prisma/client'

export type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

export type ExtendedVoterFileFilter = VoterFileFilter & {
  registeredVoterTrue?: boolean | null
  registeredVoterFalse?: boolean | null
  voterStatus?: string[] | null
  likelyMarried?: boolean | null
  likelySingle?: boolean | null
  married?: boolean | null
  single?: boolean | null
  maritalUnknown?: boolean | null
  hasChildrenYes?: boolean | null
  hasChildrenNo?: boolean | null
  hasChildrenUnknown?: boolean | null
  veteranYes?: boolean | null
  veteranUnknown?: boolean | null
  homeownerYes?: boolean | null
  homeownerLikely?: boolean | null
  homeownerNo?: boolean | null
  homeownerUnknown?: boolean | null
  businessOwnerYes?: boolean | null
  businessOwnerUnknown?: boolean | null
  educationNone?: boolean | null
  educationHighSchoolDiploma?: boolean | null
  educationTechnicalSchool?: boolean | null
  educationSomeCollege?: boolean | null
  educationCollegeDegree?: boolean | null
  educationGraduateDegree?: boolean | null
  educationUnknown?: boolean | null
  languageCodes?: string[] | null
  incomeRanges?: string[] | null
  ethnicityAsian?: boolean | null
  ethnicityEuropean?: boolean | null
  ethnicityHispanic?: boolean | null
  ethnicityAfricanAmerican?: boolean | null
  ethnicityOther?: boolean | null
  ethnicityUnknown?: boolean | null
  ageUnknown?: boolean | null
  partyUnknown?: boolean | null
  audienceUnknown?: boolean | null
  registeredVoterUnknown?: boolean | null
  incomeUnknown?: boolean | null
}
