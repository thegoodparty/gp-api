import { DomainStatus } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { isFQDN } from 'validator'
import { z } from 'zod'

export class PurchaseDomainBodySchema extends createZodDto(
  z.object({
    domain: z.string().refine((v) => isFQDN(v), {
      message:
        'Invalid domain format. Must be a Fully Qualified Domain Name (e.g., example.com or foo.example.com)',
    }),
    maxPrice: z.number().positive(),
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
