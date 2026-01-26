import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const stateSchema = z
  .string()
  .length(2, 'state must be a 2-letter code')
  .transform((v) => v.toUpperCase())

const getPersonParamsSchema = z.object({
  id: z.string().uuid(),
})

export class GetPersonParamsDTO extends createZodDto(getPersonParamsSchema) {}

export class GetPersonQueryDTO extends createZodDto(
  z.object({
    state: stateSchema,
  }),
) {}
