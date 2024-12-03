import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class AdminSendCreateEmailSchema extends createZodDto(
  z.object({ userId: z.number() }).strict(),
) {}
