import { DomainStatus } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class PurchaseDomainBodySchema extends createZodDto(
  z.object({
    domain: z.string().min(1).max(253),
  }),
) {}

export const PurchaseDomainResponseSchema = z.object({
  domain: z.object({
    id: z.number().int(),
    name: z.string(),
    status: z.nativeEnum(DomainStatus),
    price: z.number().nullable(),
  }),
  alreadyExisted: z.boolean(),
  message: z.string(),
})
