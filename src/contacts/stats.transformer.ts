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

export function transformStatsResponse(data: PeopleStats): NormalizedStats {
  const total = data?.meta?.totalConstituents || 0
  const categories = { ...(data.categories || {}) }

  // Gender: M/F/Unknown -> Male/Female/Unknown
  if (categories.gender?.buckets) {
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

  // Political Party: map Democratic->Democrat, Non-Partisan->Non Partisan, others -> Unknown
  if (categories.partiesDescription?.buckets) {
    categories.partiesDescription.buckets = recomputePercents(
      mapBuckets(
        categories.partiesDescription.buckets,
        (label) => {
          const v = (label || '').toLowerCase()
          if (v === 'republican') return 'Republican'
          if (v === 'democratic') return 'Democrat'
          if (v === 'non-partisan' || v === 'non partisan')
            return 'Non Partisan'
          if (v === 'unknown') return 'Unknown'
          return '' // drop others to Unknown below
        },
        { dropUnmappedTo: 'Unknown' },
      ),
      total,
    )
  }

  // Registered Voter: pass-through Yes/No/Unknown if present
  if (categories.registeredVoter?.buckets) {
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

  // Voter Status: Unlikely, First Time, Likely, Super, Unknown
  if (categories.voterStatus?.buckets) {
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

  // Marital Status: combine Inferred with base
  if (categories.familyMarital?.buckets || categories.maritalStatus?.buckets) {
    const src =
      categories.familyMarital?.buckets ||
      categories.maritalStatus?.buckets ||
      []
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

  // Presence of Children: Y/N/Unknown -> Yes/No/Unknown
  if (
    categories.presenceOfChildren?.buckets ||
    categories.familyChildren?.buckets
  ) {
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

  // Veteran Status: Yes/Unknown (include No if present)
  if (categories.veteranStatus?.buckets) {
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

  // Homeowner: combine Probable Homeowner into Yes
  if (
    categories.homeownerProbabilityModel?.buckets ||
    categories.homeowner?.buckets
  ) {
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

  // Business Owner: collapse to Yes/Unknown
  if (categories.businessOwner?.buckets) {
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

  // Education: map verbose labels to canonical set
  if (categories.educationOfPerson?.buckets || categories.education?.buckets) {
    const src =
      categories.educationOfPerson?.buckets ||
      categories.education?.buckets ||
      []
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

  // Ethnicity: map broad groupings
  if (categories.ethnicGroupsEthnicGroup1Desc?.buckets) {
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

  // Language: pass-through labels; Unknown retained
  if (categories.languageCode?.buckets || categories.language?.buckets) {
    const src =
      categories.languageCode?.buckets || categories.language?.buckets || []
    categories.language = {
      buckets: recomputePercents(dedupeAndSum(src), total),
    }
  }

  // Income: build ranges from amounts if needed; treat Other as Unknown
  if (categories.estimatedIncomeRange?.buckets) {
    categories.estimatedIncomeRange.buckets = recomputePercents(
      mapBuckets(
        categories.estimatedIncomeRange.buckets,
        (label) => label || 'Unknown',
      ),
      total,
    )
  } else if (categories.estimatedIncomeAmount?.buckets) {
    const ranges = [
      { label: '1k–15k', min: 1000, max: 15000 },
      { label: '15k–25k', min: 15000, max: 25000 },
      { label: '25k–35k', min: 25000, max: 35000 },
      { label: '35k–50k', min: 35000, max: 50000 },
      { label: '50k–75k', min: 50000, max: 75000 },
      { label: '75k–100k', min: 75000, max: 100000 },
      { label: '100k–125k', min: 100000, max: 125000 },
      { label: '125k–150k', min: 125000, max: 150000 },
      { label: '150k–175k', min: 150000, max: 175000 },
      { label: '175k–200k', min: 175000, max: 200000 },
      { label: '200k–250k', min: 200000, max: 250000 },
      { label: '250k+', min: 250000, max: Infinity },
    ]

    const sums = new Map<string, number>(ranges.map((r) => [r.label, 0]))
    let unknown = 0

    for (const b of categories.estimatedIncomeAmount.buckets) {
      const v = (b.label || '').toLowerCase()
      if (v === 'unknown' || v === 'other') {
        unknown += b.count
        continue
      }
      const num = parseInt(v.replace(/[^0-9]/g, ''), 10)
      if (!Number.isFinite(num)) {
        unknown += b.count
        continue
      }
      const range = ranges.find((r) => num >= r.min && num < r.max)
      if (!range) {
        unknown += b.count
      } else {
        sums.set(range.label, (sums.get(range.label) || 0) + b.count)
      }
    }

    const buckets: Bucket[] = [
      ...ranges.map((r) => ({ label: r.label, count: sums.get(r.label) || 0 })),
      { label: 'Unknown', count: unknown },
    ]
    categories.estimatedIncomeRange = {
      buckets: recomputePercents(buckets, total),
    }
  }

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

  if (categories.age && categories.ageInt) {
    delete categories.ageInt
  } else if (!categories.age && categories.ageInt) {
    categories.age = categories.ageInt
    delete categories.ageInt
  }

  if (categories.estimatedIncomeRange && categories.income)
    delete categories.income

  return {
    meta: data.meta,
    categories,
  }
}
