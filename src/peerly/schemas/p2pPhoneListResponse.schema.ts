import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class P2pPhoneListResponseSchema extends createZodDto(
  z.object({
    success: z.boolean(),
    token: z.string(),
    listName: z.string(),
    message: z.string().optional(),
  }),
) {}
