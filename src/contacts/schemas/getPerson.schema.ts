import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const getPersonParamsSchema = z.object({
  id: z.string().uuid(),
})

export class GetPersonParamsDTO extends createZodDto(getPersonParamsSchema) {}
