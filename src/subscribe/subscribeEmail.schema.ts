import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class SubscribeEmailSchema extends createZodDto(
  z.object({
    email: z.string().email(),
    name: z.string().optional(),
    uri: z.string().url(),
    formId: z.string().optional(),
    pageName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    additionalFields: z.string().optional(),
  }),
) {}
