import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const RaceInfoSchema = z.object({
  id: z.string(),
  office: z.string(),
  location: z.string(),
})

const FindByOfficeResponseSchema = z.object({
  userId: z.number().nullable(),
  confidence: z.number().optional(),
  race: RaceInfoSchema.optional(),
  message: z.string().optional(),
})

export class FindByOfficeResponseDto extends createZodDto(FindByOfficeResponseSchema) {} 