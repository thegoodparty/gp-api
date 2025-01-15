import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class MapSchema extends createZodDto(
  z.object({
    party: z.string().optional(),
    level: z.string().optional(),
    office: z.string().optional(),
    name: z.string().optional(),
    forceReCalc: z.boolean(),
    state: z.string().optional(),
    results: z.boolean(),
  }),
) {}
