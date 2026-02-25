import { createZodDto } from 'nestjs-zod'
import { EmailSchema, PhoneSchema } from '@goodparty_org/contracts'
import { z } from 'zod'

export class ContactFormSchema extends createZodDto(
  z.object({
    name: z.string(),
    email: EmailSchema,
    phone: PhoneSchema.optional(),
    message: z.string(),
    smsConsent: z.boolean(),
  }),
) {}
