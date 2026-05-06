import { z } from 'zod'

const districtStatsBucketSchema = z.object({
  label: z.string(),
  count: z.number(),
  percent: z.number(),
})

const districtStatSummarySchema = z.object({
  buckets: z.array(districtStatsBucketSchema),
})

export const onboardingStatsResponseSchema = z.object({
  districtId: z.string(),
  computedAt: z.string(),
  totalConstituents: z.number(),
  totalConstituentsWithCellPhone: z.number(),
  buckets: z.object({
    age: districtStatSummarySchema,
    homeowner: districtStatSummarySchema,
    education: districtStatSummarySchema,
    presenceOfChildren: districtStatSummarySchema,
    estimatedIncomeRange: districtStatSummarySchema,
  }),
})
