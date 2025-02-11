import { createZodDto } from 'nestjs-zod'
import { WriteEmailSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class RecoverPasswordSchema extends createZodDto(
  z.object({
    email: WriteEmailSchema,
  }),
) {}
