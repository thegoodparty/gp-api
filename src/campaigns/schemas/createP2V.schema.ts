import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateP2VSchema extends createZodDto(
  z.object({
    slug: z.string(),
  }),
) {}
