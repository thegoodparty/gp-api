import { DomainStatus, WebsiteStatus } from '@prisma/client'
import { createZodDto } from 'nestjs-zod'
import { isFQDN } from 'validator'
import { z } from 'zod'

export class PurchaseDomainBodySchema extends createZodDto(
  z.object({
    domain: z.string().refine((v) => isFQDN(v), {
      message:
        'Invalid domain format. Must be a Fully Qualified Domain Name (e.g., example.com or foo.example.com)',
    }),
  }),
) {}

export const PurchaseDomainResponseSchema = z.object({
  website: z.object({
    id: z.number(),
    vanityPath: z.string(),
    status: z.nativeEnum(WebsiteStatus),
    campaignId: z.number(),
  }),
  domain: z.object({
    id: z.number(),
    name: z.string(),
    status: z.nativeEnum(DomainStatus),
    price: z.number().nullable(),
  }),
  alreadyExisted: z.boolean(),
  message: z.string(),
})

export type PurchaseDomainResponse = z.infer<
  typeof PurchaseDomainResponseSchema
>
