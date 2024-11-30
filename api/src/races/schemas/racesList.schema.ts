import { z } from 'zod'

export const racesListSchema = z.object({
  state: z.string().min(1, 'State is required'),
  county: z.string().optional(),
  city: z.string().optional(),
  positionSlug: z.string().optional(),
})

export type RacesListQuery = z.infer<typeof racesListSchema>
