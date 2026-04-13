export type DistrictStatsBucket = {
  label: string
  count: number
  percent: number
}

export type DistrictStatSummary = {
  buckets: DistrictStatsBucket[]
}

export type StatsResponse = {
  districtId: string
  computedAt: string
  totalConstituents: number
  totalConstituentsWithCellPhone: number
  buckets: {
    age: DistrictStatSummary
    homeowner: DistrictStatSummary
    education: DistrictStatSummary
    presenceOfChildren: DistrictStatSummary
    estimatedIncomeRange: DistrictStatSummary
  }
}
