import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const MapCountSchema = z.object({
  state: z.string().optional(),
  results: z
    .string()
    .regex(/^(true|false)$/)
    .optional()
    .transform((val) =>
      val === 'true' ? true : val === 'false' ? false : undefined,
    ),
})

export const MapSchema = z.object({
  party: z.string().optional(),
  state: z.string().optional(),
  level: z.string().optional(),
  results: z
    .string()
    .regex(/^(true|false)$/)
    .optional()
    .transform((val) =>
      val === 'true' ? true : val === 'false' ? false : undefined,
    ),
  office: z.string().optional(),
  name: z.string().optional(),
  forceReCalc: z
    .string()
    .regex(/^(true|false)$/)
    .optional()
    .transform((val) =>
      val === 'true' ? true : val === 'false' ? false : undefined,
    ),
})

export class MapDto extends createZodDto(MapSchema) {}
export class MapCountDto extends createZodDto(MapCountSchema) {}
