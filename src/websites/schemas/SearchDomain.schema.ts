import { createZodDto } from 'nestjs-zod'
import { isFQDN } from 'validator'
import { z } from 'zod'

export class SearchDomainSchema extends createZodDto(
  z.object({
    domain: z.string().refine((v) => isFQDN(v), {
      message:
        'Invalid domain format. Must be a Fully Qualified Domain Name (e.g., example.com or foo.example.com)',
    }),
  }),
) {}
