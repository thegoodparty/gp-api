import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export class UserIdParamSchema extends createZodDto(userIdParamSchema) {}
