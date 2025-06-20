import { z } from 'zod'

export const segmentSchema = z.object({
  officeMunicipality: z.string().optional(),
  officeName: z.string().optional(),
  officeElectionDate: z.string().optional(),
  affiliation: z.string().optional(),
  pledged: z.boolean().optional(),
  isPro: z.boolean().optional(),
})

export type SegmentProperties = z.infer<typeof segmentSchema>

export const SEGMENT_KEYS = Object.keys(
  segmentSchema.shape,
) as (keyof SegmentProperties)[] satisfies readonly (keyof SegmentProperties)[]
