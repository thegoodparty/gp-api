import { createZodDto } from 'nestjs-zod'
import { WriteEmailSchema } from 'src/users/schemas/Email.schema'
import { z } from 'zod'

export class AdminImpersonateSchema extends createZodDto(
  z.object({
    email: WriteEmailSchema,
  }),
) {}
