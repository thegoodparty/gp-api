import { createZodDto } from 'nestjs-zod'
import { EmailSchema, PhoneSchema, ZipSchema } from '@goodparty_org/contracts'
import { StateSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class RegisterDomainSchema extends createZodDto(
  z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: EmailSchema,
    phoneNumber: PhoneSchema,
    addressLine1: z.string(),
    addressLine2: z.string().optional(),
    city: z.string(),
    state: StateSchema(),
    zipCode: ZipSchema,
  }),
) {}
