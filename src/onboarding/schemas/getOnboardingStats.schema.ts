import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const getOnboardingStatsQuerySchema = z
  .object({
    districtId: z.string().min(1).optional(),
    ballotReadyPositionId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.districtId || value.ballotReadyPositionId), {
    message: 'Either districtId or ballotReadyPositionId is required',
    path: ['districtId'],
  })

export class GetOnboardingStatsQueryDTO extends createZodDto(
  getOnboardingStatsQuerySchema,
) {}

const districtStatsBucketSchema = z.object({
  label: z.string(),
  count: z.number(),
  percent: z.number(),
})

const districtStatCategorySchema = z.array(districtStatsBucketSchema)

export const onboardingStatsResponseSchema = z.object({
  districtId: z.string(),
  computedAt: z.string().optional(),
  totalConstituents: z.number(),
  totalConstituentsWithCellPhone: z.number(),
  buckets: z.object({
    age: districtStatCategorySchema,
    homeowner: districtStatCategorySchema,
    education: districtStatCategorySchema,
    presenceOfChildren: districtStatCategorySchema,
    estimatedIncomeRange: districtStatCategorySchema,
  }),
})
