import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const SearchDomainsResponseSchema = z.object({
  candidates: z.array(
    z.object({
      domain: z.string(),
      price: z.number(),
    }),
  ),
})

export class SearchDomainsBodySchema extends createZodDto(
  z.object({
    patterns: z.array(z.string().min(1).max(200)).min(1).max(20),
    maxPrice: z.number().positive(),
  }),
) {}
