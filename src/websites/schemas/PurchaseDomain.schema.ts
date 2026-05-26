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
    // Defense-in-depth ceiling: caller-supplied cap can't be larger than this.
    // Standard campaign domains run ~$10–30; premium TLDs occasionally $50–90.
    // $100 leaves headroom while bounding the blast radius of a compromised
    // or misconfigured caller passing maxPrice: 999999.
    maxPrice: z.number().positive().max(100),
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
