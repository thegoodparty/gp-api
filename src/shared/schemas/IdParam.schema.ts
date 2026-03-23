import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export class IdParamSchema extends createZodDto(idParamSchema) {}
