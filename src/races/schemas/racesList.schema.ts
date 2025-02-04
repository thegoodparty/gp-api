import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const racesListSchema = z.object({
  state: z
    .string()
    .min(2, 'State is required')
    .transform((val) => val.toUpperCase()),
  county: z.string().optional(),
  city: z.string().optional(),
  positionSlug: z.string(),
  viewAll: z.boolean().optional(),
})

export class RacesListQueryDto extends createZodDto(racesListSchema) {}

export class RacesByCountyQueryDto extends createZodDto(
  racesListSchema.pick({ state: true }).extend({
    county: z.string().min(1, { message: 'county is required' }),
  }),
) {}

export class RacesByCityQueryDto extends createZodDto(
  racesListSchema.pick({ state: true, county: true }).extend({
    county: z.string().min(1, { message: 'county is required' }),
    city: z.string().min(1, { message: 'city is required' }),
  }),
) {}
export class RacesByCityProximityQueryDto extends createZodDto(
  racesListSchema.pick({ state: true, county: true }).extend({
    city: z.string().min(1, { message: 'city is required' }),
  }),
) {}
