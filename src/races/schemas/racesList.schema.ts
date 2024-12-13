import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const racesListSchema = z.object({
  state: z.string().min(1, 'State is required'),
  county: z.string().optional(),
  city: z.string().optional(),
  positionSlug: z.string().optional(),
})

export class RacesListQueryDto extends createZodDto(racesListSchema) {}
