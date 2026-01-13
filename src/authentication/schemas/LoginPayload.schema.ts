import { createZodDto } from 'nestjs-zod'
import { PasswordSchema, WriteEmailSchema } from 'src/shared/schemas'
import { z } from 'zod'

export const LoginPayloadSchema = z.object({
  email: WriteEmailSchema,
  password: PasswordSchema.optional(),
})

export type LoginPayload = z.infer<typeof LoginPayloadSchema>

export class LoginRequestPayloadDto extends createZodDto(LoginPayloadSchema) {}
