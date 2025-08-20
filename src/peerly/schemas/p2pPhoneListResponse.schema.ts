import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class P2pPhoneListResponseSchema extends createZodDto(
  z.object({
    token: z.string(),
  }),
) {}
