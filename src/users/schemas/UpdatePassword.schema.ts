import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PasswordSchema } from 'src/shared/schemas'

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
