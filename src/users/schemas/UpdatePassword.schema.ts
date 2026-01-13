import { createZodDto } from 'nestjs-zod'
import { PasswordSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class UpdatePasswordSchemaDto extends createZodDto(
  z
    .object({
      oldPassword: PasswordSchema,
      newPassword: PasswordSchema,
    })
    .required({
      newPassword: true,
    })
    .strict(),
) {}
