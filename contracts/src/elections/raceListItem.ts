import { z } from 'zod'

export const RaceListItemSchema = z.object({
  id: z.string(),
  brPositionId: z.string(),
  position: z.object({
    name: z.string(),
    level: z.string(),
    state: z.string(),
    normalizedPosition: z.object({ name: z.string() }).optional(),
  }),
  election: z.object({
    electionDay: z.string(),
  }),
  city: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
})

export const RaceListItemArraySchema = z.array(RaceListItemSchema)
export type RaceListItem = z.infer<typeof RaceListItemSchema>
