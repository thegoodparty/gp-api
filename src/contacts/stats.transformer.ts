type Bucket = { label: string; count: number; percent?: number }

export type PeopleStats = {
  meta: {
    state: string
    districtType: string
    districtName: string
    electionYear?: number
    totalConstituents: number
  }
  categories: Record<string, { buckets: Bucket[] }>
}

export type NormalizedStats = PeopleStats

function safePercent(count: number, total: number): number {
  if (!total || !Number.isFinite(total)) return 0
  return Math.round((count / total) * 1000) / 1000
}

function sumBuckets(buckets: Bucket[]): number {
  return buckets.reduce(
    (acc, b) => acc + (Number.isFinite(b.count) ? b.count : 0),
    0,
  )
}

function dedupeAndSum(buckets: Bucket[]): Bucket[] {
  const map = new Map<string, number>()
  for (const b of buckets) {
    const key = (b.label || 'Unknown').trim()
    map.set(key, (map.get(key) || 0) + (Number.isFinite(b.count) ? b.count : 0))
  }
  return Array.from(map.entries()).map(([label, count]) => ({ label, count }))
}

function recomputePercents(buckets: Bucket[], total: number): Bucket[] {
  return buckets.map((b) => ({ ...b, percent: safePercent(b.count, total) }))
}

function mapBuckets(
  buckets: Bucket[],
  mapper: (label: string) => string,
  options?: { dropUnmappedTo?: string },
): Bucket[] {
  const mapped: Bucket[] = []
  for (const b of buckets) {
    const to = mapper(b.label)
    if (!to && options?.dropUnmappedTo) {
      mapped.push({ label: options.dropUnmappedTo, count: b.count })
    } else if (to) {
      mapped.push({ label: to, count: b.count })
    }
  }
  return dedupeAndSum(mapped)
}

function combineLabels(
  buckets: Bucket[],
  groups: Record<string, string[]>,
): Bucket[] {
  const map = new Map<string, number>()
  const handled = new Set<string>()

  // Combine defined groups
  for (const [target, sources] of Object.entries(groups)) {
    let sum = 0
    for (const b of buckets) {
      if (sources.includes(b.label)) {
        sum += b.count
        handled.add(b.label)
      }
    }
    if (sum > 0) map.set(target, (map.get(target) || 0) + sum)
  }

  // Carry over any buckets not part of groups
  for (const b of buckets) {
    if (!handled.has(b.label))
      map.set(b.label, (map.get(b.label) || 0) + b.count)
  }

  return Array.from(map.entries()).map(([label, count]) => ({ label, count }))
}

function normalizeGender(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.gender?.buckets) return
  categories.gender.buckets = recomputePercents(
    mapBuckets(categories.gender.buckets, (label) => {
      const v = (label || '').toLowerCase()
      if (v === 'm' || v === 'male') return 'Male'
      if (v === 'f' || v === 'female') return 'Female'
      return 'Unknown'
    }),
    total,
  )
}

function normalizeParties(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.partiesDescription?.buckets) return
  categories.partiesDescription.buckets = recomputePercents(
    mapBuckets(
      categories.partiesDescription.buckets,
      (label) => {
        const v = (label || '').toLowerCase()
        if (v === 'republican') return 'Republican'
        if (v === 'democratic') return 'Democrat'
        if (v === 'non-partisan' || v === 'non partisan') return 'Non Partisan'
        if (v === 'unknown') return 'Unknown'
        return ''
      },
      { dropUnmappedTo: 'Unknown' },
    ),
    total,
  )
}

function normalizeRegisteredVoter(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.registeredVoter?.buckets) return
  categories.registeredVoter.buckets = recomputePercents(
    mapBuckets(categories.registeredVoter.buckets, (label) => {
      const v = (label || '').toLowerCase()
      if (v === 'yes') return 'Yes'
      if (v === 'no') return 'No'
      return 'Unknown'
    }),
    total,
  )
}

function normalizeVoterStatus(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.voterStatus?.buckets) return
  categories.voterStatus.buckets = recomputePercents(
    mapBuckets(categories.voterStatus.buckets, (label) => {
      const v = (label || '').toLowerCase()
      if (v === 'unlikely') return 'Unlikely'
      if (v === 'first time') return 'First Time'
      if (v === 'likely') return 'Likely'
      if (v === 'super') return 'Super'
      return 'Unknown'
    }),
    total,
  )
}

function normalizeMaritalStatus(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.familyMarital?.buckets && !categories.maritalStatus?.buckets)
    return
  const src =
    categories.familyMarital?.buckets || categories.maritalStatus?.buckets || []
  const mapped = mapBuckets(src, (label) => {
    const v = (label || '').toLowerCase()
    if (v.includes('inferred married') || v === 'married')
      return v.includes('inferred') ? 'Inferred Married' : 'Married'
    if (v.includes('inferred single') || v === 'single')
      return v.includes('inferred') ? 'Inferred Single' : 'Single'
    if (v === 'unknown') return 'Unknown'
    return ''
  })
  const combined = combineLabels(mapped, {
    Married: ['Married', 'Inferred Married'],
    Single: ['Single', 'Inferred Single'],
  })
  const buckets = recomputePercents(dedupeAndSum(combined), total)
  categories.maritalStatus = { buckets }
}

function normalizePresenceOfChildren(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (
    !categories.presenceOfChildren?.buckets &&
    !categories.familyChildren?.buckets
  )
    return
  const src =
    categories.presenceOfChildren?.buckets ||
    categories.familyChildren?.buckets ||
    []
  const buckets = recomputePercents(
    mapBuckets(src, (label) => {
      const v = (label || '').toLowerCase()
      if (v === 'y' || v === 'yes') return 'Yes'
      if (v === 'n' || v === 'no') return 'No'
      return 'Unknown'
    }),
    total,
  )
  categories.presenceOfChildren = { buckets }
}

function normalizeVeteranStatus(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.veteranStatus?.buckets) return
  categories.veteranStatus.buckets = recomputePercents(
    mapBuckets(categories.veteranStatus.buckets, (label) => {
      const v = (label || '').toLowerCase()
      if (v === 'yes') return 'Yes'
      if (v === 'no') return 'No'
      return 'Unknown'
    }),
    total,
  )
}

function normalizeHomeowner(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (
    !categories.homeownerProbabilityModel?.buckets &&
    !categories.homeowner?.buckets
  )
    return
  const src =
    categories.homeownerProbabilityModel?.buckets ||
    categories.homeowner?.buckets ||
    []
  const mapped = mapBuckets(src, (label) => {
    const v = (label || '').toLowerCase()
    if (v.includes('home owner') || v.includes('yes homeowner'))
      return 'Home Owner'
    if (v.includes('probable homeowner') || v.includes('probable home owner'))
      return 'Probable Homeowner'
    if (v.includes('renter')) return 'Renter'
    if (v === 'unknown') return 'Unknown'
    return ''
  })
  const combined = combineLabels(mapped, {
    Yes: ['Home Owner', 'Probable Homeowner'],
    No: ['Renter'],
  })
  const buckets = recomputePercents(dedupeAndSum(combined), total)
  categories.homeowner = { buckets }
}

function normalizeBusinessOwner(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.businessOwner?.buckets) return
  const yesCount = sumBuckets(
    categories.businessOwner.buckets.filter(
      (b) => (b.label || '').toLowerCase() !== 'unknown',
    ),
  )
  const unknownCount = sumBuckets(
    categories.businessOwner.buckets.filter(
      (b) => (b.label || '').toLowerCase() === 'unknown',
    ),
  )
  const buckets = recomputePercents(
    [
      { label: 'Yes', count: yesCount },
      { label: 'Unknown', count: unknownCount },
    ],
    total,
  )
  categories.businessOwner = { buckets }
}

function normalizeEducation(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.educationOfPerson?.buckets && !categories.education?.buckets)
    return
  const src =
    categories.educationOfPerson?.buckets || categories.education?.buckets || []
  const buckets = recomputePercents(
    mapBuckets(src, (label) => {
      const v = (label || '').toLowerCase()
      if (v.includes('did not complete high school')) return 'None'
      if (v.includes('completed high school')) return 'High School Diploma'
      if (v.includes('vocational') || v.includes('technical school'))
        return 'Technical School'
      if (v.includes('did not complete college')) return 'Some College'
      if (v.includes('completed graduate')) return 'Graduate Degree'
      if (
        v.includes('completed college') ||
        v.includes('completed college likely')
      )
        return 'College Degree'
      if (v === 'unknown') return 'Unknown'
      return ''
    }),
    total,
  )
  categories.education = { buckets }
}

function normalizeEthnicity(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.ethnicGroupsEthnicGroup1Desc?.buckets) return
  categories.ethnicGroupsEthnicGroup1Desc.buckets = recomputePercents(
    mapBuckets(categories.ethnicGroupsEthnicGroup1Desc.buckets, (label) => {
      const v = (label || '').toLowerCase()
      if (
        v.includes('east & south asian') ||
        v.includes('east and south asian') ||
        v === 'asian'
      )
        return 'Asian'
      if (v.includes('european')) return 'European'
      if (
        v.includes('hispanic & portuguese') ||
        v.includes('hispanic and portuguese') ||
        v === 'hispanic'
      )
        return 'Hispanic'
      if (v.includes('likely african american') || v === 'african american')
        return 'African American'
      if (v === 'other') return 'Other'
      return 'Unknown'
    }),
    total,
  )
}

function normalizeLanguage(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.languageCode?.buckets && !categories.language?.buckets) return
  const src =
    categories.languageCode?.buckets || categories.language?.buckets || []
  categories.language = {
    buckets: recomputePercents(dedupeAndSum(src), total),
  }
}

function normalizeIncome(
  categories: Record<string, { buckets: Bucket[] }>,
  total: number,
) {
  if (!categories.income?.buckets) return

  const labelMap: Record<string, string> = {
    '1000-14999': '1k–15k',
    '15000-24999': '15k–25k',
    '25000-34999': '25k–35k',
    '35000-49999': '35k–50k',
    '50000-74999': '50k–75k',
    '75000-99999': '75k–100k',
    '100000-124999': '100k–125k',
    '125000-149999': '125k–150k',
    '150000-174999': '150k–175k',
    '175000-199999': '175k–200k',
    '200000-249999': '200k–250k',
    '250000-1000000000': '250k+',
  }

  const buckets = categories.income.buckets.map((b) => ({
    label: labelMap[b.label] || b.label,
    count: b.count,
  }))

  categories.estimatedIncomeRange = {
    buckets: recomputePercents(buckets, total),
  }
}

function pruneDuplicateCategories(
  categories: Record<string, { buckets: Bucket[] }>,
) {
  if (categories.maritalStatus && categories.familyMarital)
    delete categories.familyMarital
  if (categories.presenceOfChildren && categories.familyChildren)
    delete categories.familyChildren
  if (categories.homeowner && categories.homeownerProbabilityModel)
    delete categories.homeownerProbabilityModel
  if (categories.language && categories.languageCode)
    delete categories.languageCode
  if (categories.education && categories.educationOfPerson)
    delete categories.educationOfPerson
  if (categories.estimatedIncomeRange && categories.estimatedIncomeAmount)
    delete categories.estimatedIncomeAmount
  if (categories.estimatedIncomeRange && categories.income)
    delete categories.income
}

function enforceAgePreference(
  categories: Record<string, { buckets: Bucket[] }>,
) {
  if (categories.age && categories.ageInt) {
    delete categories.ageInt
  } else if (!categories.age && categories.ageInt) {
    categories.age = categories.ageInt
    delete categories.ageInt
  }
}

function removeLegacyIncomeCategory(
  categories: Record<string, { buckets: Bucket[] }>,
) {
  if (categories.estimatedIncomeRange && categories.income)
    delete categories.income
}

export function transformStatsResponse(data: PeopleStats): NormalizedStats {
  const total = data?.meta?.totalConstituents || 0
  const categories = { ...(data.categories || {}) }

  // Gender: M/F/Unknown -> Male/Female/Unknown
  normalizeGender(categories, total)

  // Political Party: map Democratic->Democrat, Non-Partisan->Non Partisan, others -> Unknown
  normalizeParties(categories, total)

  // Registered Voter: pass-through Yes/No/Unknown if present
  normalizeRegisteredVoter(categories, total)

  // Voter Status: Unlikely, First Time, Likely, Super, Unknown
  normalizeVoterStatus(categories, total)

  // Marital Status: combine Inferred with base
  normalizeMaritalStatus(categories, total)

  // Presence of Children: Y/N/Unknown -> Yes/No/Unknown
  normalizePresenceOfChildren(categories, total)

  // Veteran Status: Yes/Unknown (include No if present)
  normalizeVeteranStatus(categories, total)

  // Homeowner: combine Probable Homeowner into Yes
  normalizeHomeowner(categories, total)

  // Business Owner: collapse to Yes/Unknown
  normalizeBusinessOwner(categories, total)

  // Education: map verbose labels to canonical set
  normalizeEducation(categories, total)

  // Ethnicity: map broad groupings
  normalizeEthnicity(categories, total)

  // Language: pass-through labels; Unknown retained
  normalizeLanguage(categories, total)

  // Income: build ranges from amounts if needed; treat Other as Unknown
  normalizeIncome(categories, total)

  pruneDuplicateCategories(categories)

  enforceAgePreference(categories)

  removeLegacyIncomeCategory(categories)

  return {
    meta: data.meta,
    categories,
  }
}
