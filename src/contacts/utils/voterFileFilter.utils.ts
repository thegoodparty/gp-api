import { ExtendedVoterFileFilter } from '../contacts.types'

export type FilterObject = Record<
  string,
  | boolean
  | {
      in?: string[] | number[]
      eq?: string | number
      gte?: number
      lte?: number
      is?: 'not_null' | 'null'
    }
>

export const convertVoterFileFilterToFilters = (
  segment: ExtendedVoterFileFilter,
): FilterObject => {
  const filters: FilterObject = {}
  const excludeFields = new Set([
    'id',
    'createdAt',
    'updatedAt',
    'name',
    'voterCount',
    'campaignId',
    'campaign',
    'outreaches',
    'registeredVoterTrue',
    'registeredVoterFalse',
    'registeredVoterUnknown',
  ])

  const fieldsHandledSeparately = new Set([
    'hasCellPhone',
    'hasLandline',
    'audienceSuperVoters',
    'audienceLikelyVoters',
    'audienceUnreliableVoters',
    'audienceUnlikelyVoters',
    'audienceFirstTimeVoters',
    'audienceUnknown',
    'partyIndependent',
    'partyDemocrat',
    'partyRepublican',
    'partyUnknown',
    'genderMale',
    'genderFemale',
    'genderUnknown',
    'age18_25',
    'age25_35',
    'age35_50',
    'age50Plus',
    'ageUnknown',
    'likelyMarried',
    'likelySingle',
    'married',
    'single',
    'maritalUnknown',
    'veteranYes',
    'veteranUnknown',
    'educationNone',
    'educationHighSchoolDiploma',
    'educationTechnicalSchool',
    'educationSomeCollege',
    'educationCollegeDegree',
    'educationGraduateDegree',
    'educationUnknown',
    'ethnicityAsian',
    'ethnicityEuropean',
    'ethnicityHispanic',
    'ethnicityAfricanAmerican',
    'ethnicityOther',
    'ethnicityUnknown',
    'businessOwnerYes',
    'businessOwnerUnknown',
    'hasChildrenYes',
    'hasChildrenNo',
    'hasChildrenUnknown',
    'homeownerYes',
    'homeownerLikely',
    'homeownerNo',
    'homeownerUnknown',
    'incomeUnknown',
  ])

  for (const [key, value] of Object.entries(segment)) {
    if (excludeFields.has(key)) continue

    if (typeof value === 'boolean' && value) {
      if (fieldsHandledSeparately.has(key)) {
        continue
      }
      filters[key] = true
    } else if (Array.isArray(value) && value.length > 0) {
      if (key === 'languageCodes') {
        const normalizedLanguages = value.map((lang: string) =>
          lang.toLowerCase() === 'other' ? 'Other' : lang,
        )
        filters['language'] =
          normalizedLanguages.length === 1
            ? { eq: normalizedLanguages[0] }
            : { in: normalizedLanguages }
      } else if (key === 'voterStatus') {
        filters['voterStatus'] =
          value.length === 1 ? { eq: value[0] } : { in: value }
      } else if (key === 'incomeRanges') {
        if (!segment.incomeUnknown) {
          const numericValues = value
            .map((v) => {
              const num = Number(v)
              return Number.isFinite(num) ? num : null
            })
            .filter((v): v is number => v !== null)

          if (numericValues.length > 0) {
            filters['estimatedIncomeAmountInt'] =
              numericValues.length === 1
                ? { eq: numericValues[0] }
                : { in: numericValues }
          }
        }
      } else {
        filters[key] = value.length === 1 ? { eq: value[0] } : { in: value }
      }
    }
  }

  if (!filters['voterStatus']) {
    const voterStatusValues: string[] = []
    if (segment.audienceSuperVoters) voterStatusValues.push('Super')
    if (segment.audienceLikelyVoters) voterStatusValues.push('Likely')
    if (segment.audienceUnreliableVoters) voterStatusValues.push('Unreliable')
    if (segment.audienceUnlikelyVoters) voterStatusValues.push('Unlikely')
    if (segment.audienceFirstTimeVoters) voterStatusValues.push('First Time')
    if (segment.audienceUnknown) voterStatusValues.push('Unknown')
    if (voterStatusValues.length > 0) {
      filters['voterStatus'] =
        voterStatusValues.length === 1
          ? { eq: voterStatusValues[0] }
          : { in: voterStatusValues }
    }
  }

  const politicalPartyValues: string[] = []
  if (segment.partyIndependent) politicalPartyValues.push('Independent')
  if (segment.partyDemocrat) politicalPartyValues.push('Democratic')
  if (segment.partyRepublican) politicalPartyValues.push('Republican')
  if (segment.partyUnknown) politicalPartyValues.push('Unknown')
  if (politicalPartyValues.length > 0) {
    filters['politicalParty'] =
      politicalPartyValues.length === 1
        ? { eq: politicalPartyValues[0] }
        : { in: politicalPartyValues }
  }

  const genderValues: string[] = []
  if (segment.genderMale) genderValues.push('M')
  if (segment.genderFemale) genderValues.push('F')
  if (segment.genderUnknown) genderValues.push('Unknown')
  if (genderValues.length > 0) {
    filters['gender'] =
      genderValues.length === 1 ? { eq: genderValues[0] } : { in: genderValues }
  }

  const ageRanges: Array<{ min: number; max: number | null }> = []
  if (segment.age18_25) ageRanges.push({ min: 18, max: 25 })
  if (segment.age25_35) ageRanges.push({ min: 25, max: 35 })
  if (segment.age35_50) ageRanges.push({ min: 35, max: 50 })
  if (segment.age50Plus) ageRanges.push({ min: 50, max: null })

  if (ageRanges.length > 0 && !segment.ageUnknown) {
    if (ageRanges.length === 1) {
      const range = ageRanges[0]
      if (range.max === null) {
        filters['ageInt'] = { gte: range.min }
      } else {
        filters['ageInt'] = { gte: range.min, lte: range.max }
      }
    } else {
      const sortedRanges = ageRanges.sort((a, b) => a.min - b.min)
      const hasUnbounded = sortedRanges.some((r) => r.max === null)
      const minAge = sortedRanges[0].min
      const maxAge = hasUnbounded
        ? null
        : Math.max(...sortedRanges.map((r) => r.max ?? 0))

      const isContiguous = sortedRanges.every((range, index) => {
        if (index === 0) return true
        const prevRange = sortedRanges[index - 1]
        return (
          prevRange.max !== null &&
          (range.min === prevRange.max || range.min === prevRange.max + 1)
        )
      })

      if (isContiguous && !hasUnbounded) {
        filters['ageInt'] = { gte: minAge, lte: maxAge ?? 120 }
      } else if (isContiguous && hasUnbounded) {
        filters['ageInt'] = { gte: minAge }
      } else {
        const allAges = new Set<number>()
        for (const range of ageRanges) {
          if (range.max === null) {
            for (let age = range.min; age <= 120; age++) {
              allAges.add(age)
            }
          } else {
            for (let age = range.min; age <= range.max; age++) {
              allAges.add(age)
            }
          }
        }
        filters['ageInt'] = { in: Array.from(allAges).sort((a, b) => a - b) }
      }
    }
  } else if (segment.ageUnknown) {
    filters['ageInt'] = { is: 'null' }
  }

  const maritalValues: string[] = []
  if (segment.likelyMarried) maritalValues.push('Inferred Married')
  if (segment.likelySingle) maritalValues.push('Inferred Single')
  if (segment.married) maritalValues.push('Married')
  if (segment.single) maritalValues.push('Single')
  if (segment.maritalUnknown) maritalValues.push('Unknown')
  if (maritalValues.length > 0) {
    filters['maritalStatus'] =
      maritalValues.length === 1
        ? { eq: maritalValues[0] }
        : { in: maritalValues }
  }

  const veteranValues: string[] = []
  if (segment.veteranYes) veteranValues.push('Yes')
  if (segment.veteranUnknown) veteranValues.push('Unknown')
  if (veteranValues.length > 0) {
    filters['veteranStatus'] =
      veteranValues.length === 1
        ? { eq: veteranValues[0] }
        : { in: veteranValues }
  }

  const educationValues: string[] = []
  if (segment.educationNone) educationValues.push('None')
  if (segment.educationHighSchoolDiploma)
    educationValues.push('High School Diploma')
  if (segment.educationTechnicalSchool) educationValues.push('Technical School')
  if (segment.educationSomeCollege) educationValues.push('Some College')
  if (segment.educationCollegeDegree) educationValues.push('College Degree')
  if (segment.educationGraduateDegree) educationValues.push('Graduate Degree')
  if (segment.educationUnknown) educationValues.push('Unknown')
  if (educationValues.length > 0) {
    filters['educationLevel'] =
      educationValues.length === 1
        ? { eq: educationValues[0] }
        : { in: educationValues }
  }

  const ethnicityValues: string[] = []
  if (segment.ethnicityAsian) ethnicityValues.push('Asian')
  if (segment.ethnicityEuropean) ethnicityValues.push('European')
  if (segment.ethnicityHispanic) ethnicityValues.push('Hispanic')
  if (segment.ethnicityAfricanAmerican) ethnicityValues.push('African American')
  if (segment.ethnicityOther) ethnicityValues.push('Other')
  if (segment.ethnicityUnknown) ethnicityValues.push('Unknown')
  if (ethnicityValues.length > 0) {
    filters['ethnicity'] =
      ethnicityValues.length === 1
        ? { eq: ethnicityValues[0] }
        : { in: ethnicityValues }
  }

  const businessOwnerValues: string[] = []
  if (segment.businessOwnerYes) businessOwnerValues.push('Yes')
  if (segment.businessOwnerUnknown) businessOwnerValues.push('Unknown')
  if (businessOwnerValues.length > 0) {
    filters['businessOwner'] =
      businessOwnerValues.length === 1
        ? { eq: businessOwnerValues[0] }
        : { in: businessOwnerValues }
  }

  const presenceOfChildrenValues: string[] = []
  if (segment.hasChildrenYes) presenceOfChildrenValues.push('Yes')
  if (segment.hasChildrenNo) presenceOfChildrenValues.push('No')
  if (segment.hasChildrenUnknown) presenceOfChildrenValues.push('Unknown')
  if (presenceOfChildrenValues.length > 0) {
    filters['presenceOfChildren'] =
      presenceOfChildrenValues.length === 1
        ? { eq: presenceOfChildrenValues[0] }
        : { in: presenceOfChildrenValues }
  }

  const homeownerValues: string[] = []
  if (segment.homeownerYes) homeownerValues.push('Yes')
  if (segment.homeownerLikely) homeownerValues.push('Likely')
  if (segment.homeownerNo) homeownerValues.push('No')
  if (segment.homeownerUnknown) homeownerValues.push('Unknown')
  if (homeownerValues.length > 0) {
    filters['homeowner'] =
      homeownerValues.length === 1
        ? { eq: homeownerValues[0] }
        : { in: homeownerValues }
  }

  if (segment.incomeUnknown && !filters['estimatedIncomeAmountInt']) {
    filters['estimatedIncomeAmountInt'] = { is: 'null' }
  }

  if (segment.hasCellPhone) {
    filters['hasCellPhone'] = true
  }

  if (segment.hasLandline) {
    filters['hasLandline'] = true
  }
  return filters
}
