export type DistrictStatsBucket = {
  label: string
  count: number
  percent: number
}

export type DistrictStatCategory = DistrictStatsBucket[]

export type StatsResponse = {
  districtId: string
  computedAt?: string
  totalConstituents: number
  totalConstituentsWithCellPhone: number
  buckets: {
    age: DistrictStatCategory
    homeowner: DistrictStatCategory
    education: DistrictStatCategory
    presenceOfChildren: DistrictStatCategory
    estimatedIncomeRange: DistrictStatCategory
  }
}
