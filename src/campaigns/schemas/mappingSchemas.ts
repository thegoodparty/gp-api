import { createZodDto } from 'nestjs-zod'
import { stringToBoolean } from 'src/shared/util/zod.util'
import { z } from 'zod'

export const MapCountSchema = z.object({
  state: z.string().optional(),
  results: stringToBoolean(),
})

export const MapSchema = z.object({
  party: z.string().optional(),
  state: z.string().optional(),
  level: z.string().optional(),
  results: stringToBoolean(),
  office: z.string().optional(),
  name: z.string().optional(),
  forceReCalc: stringToBoolean(),
})

export class MapDto extends createZodDto(MapSchema) {}
export class MapCountDto extends createZodDto(MapCountSchema) {}
