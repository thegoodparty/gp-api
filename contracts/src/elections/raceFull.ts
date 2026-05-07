import { z } from 'zod'

const FilingPeriodSchema = z.object({
  startOn: z.string().nullable().optional(),
  endOn: z.string().nullable().optional(),
})

const PositionFullSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  partisanType: z.string().nullable().optional(),
  hasPrimary: z.boolean().nullable().optional(),
  electionFrequencies: z
    .array(z.object({ frequency: z.array(z.number()) }))
    .nullable()
    .optional(),
  normalizedPosition: z.object({ name: z.string() }).nullable().optional(),
  mtfcc: z.string().nullable().optional(),
  geoId: z.string().nullable().optional(),
  subAreaName: z.string().nullable().optional(),
  subAreaValue: z.string().nullable().optional(),
  tier: z.union([z.string(), z.number()]).nullable().optional(),
})

const ElectionFullSchema = z.object({
  id: z.string().nullable().optional(),
  electionDay: z.string(),
  primaryElectionDate: z.string().nullable().optional(),
  primaryElectionId: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
})

export const RaceFullSchema = z.object({
  id: z.string(),
  isPrimary: z.boolean().nullable().optional(),
  position: PositionFullSchema,
  election: ElectionFullSchema,
  filingPeriods: z.array(FilingPeriodSchema).nullable().optional(),
  city: z.string().nullable().optional(),
})

export type RaceFull = z.infer<typeof RaceFullSchema>
