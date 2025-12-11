// SYNC: Keep in sync with gp-webapp/app/(candidate)/dashboard/contacts/[[...attr]]/components/segments/FiltersSheet.js

export type IncomeRange = {
  label: string
  min: number
  max: number | null
}

export const INCOME_RANGES: IncomeRange[] = [
  { label: '$1k - $15k', min: 1000, max: 15000 },
  { label: '$15k - $25k', min: 15000, max: 25000 },
  { label: '$25k - $35k', min: 25000, max: 35000 },
  { label: '$35k - $50k', min: 35000, max: 50000 },
  { label: '$50k - $75k', min: 50000, max: 75000 },
  { label: '$75k - $100k', min: 75000, max: 100000 },
  { label: '$100k - $125k', min: 100000, max: 125000 },
  { label: '$125k - $150k', min: 125000, max: 150000 },
  { label: '$150k - $175k', min: 150000, max: 175000 },
  { label: '$175k - $200k', min: 175000, max: 200000 },
  { label: '$200k - $250k', min: 200000, max: 250000 },
  { label: '$250k +', min: 250000, max: null },
]

export const INCOME_RANGE_MAP: Record<
  string,
  { min: number; max: number | null }
> = Object.fromEntries(
  INCOME_RANGES.map((r) => [r.label, { min: r.min, max: r.max }]),
)

export const VALID_INCOME_LABELS = INCOME_RANGES.map((r) => r.label)
