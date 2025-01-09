import { createZodDto } from 'nestjs-zod'
import { RolesSchema } from 'src/users/schemas/Roles.schema'
import { z } from 'zod'

export class AdminCreateUserSchema extends createZodDto(
  z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      roles: RolesSchema,
    })
    .strict(),
) {}
