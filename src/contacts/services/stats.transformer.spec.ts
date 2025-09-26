import { PeopleStats, transformStatsResponse } from './stats.transformer'

describe('transformStatsResponse', () => {
  const base = {
    meta: {
      state: 'WY',
      districtType: 'Unified_School_District',
      districtName: 'LINCOLN CNTY SD 2 (EST.)',
      electionYear: 2025,
      totalConstituents: 100,
    },
    categories: {},
  }

  it('combines marital status inferred and base labels', () => {
    const data = {
      ...base,
      categories: {
        familyMarital: {
          buckets: [
            { label: 'Inferred Married', count: 10 },
            { label: 'Married', count: 5 },
            { label: 'Inferred Single', count: 7 },
            { label: 'Single', count: 3 },
            { label: 'Unknown', count: 75 },
          ],
        },
      },
    }
    const res = transformStatsResponse(data as PeopleStats)
    const buckets = res.categories.maritalStatus.buckets
    const married = buckets.find((b) => b.label === 'Married')
    const single = buckets.find((b) => b.label === 'Single')
    const unknown = buckets.find((b) => b.label === 'Unknown')
    expect(married?.count).toBe(15)
    expect(single?.count).toBe(10)
    expect(unknown?.count).toBe(75)
  })

  it('combines homeowner probable into Yes', () => {
    const data = {
      ...base,
      categories: {
        homeownerProbabilityModel: {
          buckets: [
            { label: 'Home Owner', count: 20 },
            { label: 'Probable Homeowner', count: 10 },
            { label: 'Renter', count: 30 },
            { label: 'Unknown', count: 40 },
          ],
        },
      },
    }
    const res = transformStatsResponse(data as PeopleStats)
    const buckets = res.categories.homeowner.buckets
    const yes = buckets.find((b) => b.label === 'Yes')
    const no = buckets.find((b) => b.label === 'No')
    const unknown = buckets.find((b) => b.label === 'Unknown')
    expect(yes?.count).toBe(30)
    expect(no?.count).toBe(30)
    expect(unknown?.count).toBe(40)
  })

  it('buckets income amounts into ranges and treats Other as Unknown', () => {
    const data = {
      ...base,
      categories: {
        estimatedIncomeAmount: {
          buckets: [
            { label: '$1,200', count: 1 },
            { label: '$24,000', count: 2 },
            { label: '$80,000', count: 3 },
            { label: '$250,000', count: 4 },
            { label: 'Other', count: 5 },
            { label: 'Unknown', count: 6 },
          ],
        },
      },
    }
    const res = transformStatsResponse(data as PeopleStats)
    const r1 = res.categories.estimatedIncomeRange.buckets.find(
      (b) => b.label === '1k–15k',
    )
    const r2 = res.categories.estimatedIncomeRange.buckets.find(
      (b) => b.label === '15k–25k',
    )
    const r5 = res.categories.estimatedIncomeRange.buckets.find(
      (b) => b.label === '50k–75k',
    )
    const r12 = res.categories.estimatedIncomeRange.buckets.find(
      (b) => b.label === '250k+',
    )
    const unk = res.categories.estimatedIncomeRange.buckets.find(
      (b) => b.label === 'Unknown',
    )
    expect(r1?.count).toBe(1)
    expect(r2?.count).toBe(2)
    expect(r5?.count).toBe(3)
    expect(r12?.count).toBe(4)
    expect(unk?.count).toBe(11)
  })
})
