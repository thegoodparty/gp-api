import { DomainStatus } from '../../generated/prisma'
import { createZodDto } from 'nestjs-zod'
import { isFQDN } from 'validator'
import { z } from 'zod'
import { hasSupportedTld, SUPPORTED_TLDS } from '../domains.types'

export class PurchaseDomainBodySchema extends createZodDto(
  z.object({
    domain: z
      .string()
      .refine((v) => isFQDN(v), {
        message:
          'Invalid domain format. Must be a Fully Qualified Domain Name (e.g., example.com or foo.example.com)',
      })
      // The search fan-out already restricts results to the allowlist, but
      // purchase takes a caller-supplied domain directly — enforce the same
      // allowlist here so the irreversible, paid path can't buy an excluded
      // TLD (matches the searchDomains @McpTool "never offered" contract).
      .refine((v) => hasSupportedTld(v), {
        message: `Domain TLD must be one of: ${SUPPORTED_TLDS.map(
          (tld) => `.${tld}`,
        ).join(', ')}`,
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
