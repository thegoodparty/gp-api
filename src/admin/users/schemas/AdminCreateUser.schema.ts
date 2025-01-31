import { createZodDto } from 'nestjs-zod'
import { RolesSchema, WriteEmailSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class AdminCreateUserSchema extends createZodDto(
  z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      email: WriteEmailSchema,
      roles: RolesSchema,
    })
    .strict(),
) {}
