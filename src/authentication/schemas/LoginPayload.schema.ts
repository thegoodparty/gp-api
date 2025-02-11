import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { PasswordSchema, WriteEmailSchema } from 'src/shared/schemas'

export const LoginPayloadSchema = z.object({
  email: WriteEmailSchema,
  password: PasswordSchema.optional(),
})

export type LoginPayload = z.infer<typeof LoginPayloadSchema>

export class LoginRequestPayloadDto extends createZodDto(LoginPayloadSchema) {}
