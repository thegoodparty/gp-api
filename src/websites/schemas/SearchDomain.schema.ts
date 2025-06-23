import { createZodDto } from 'nestjs-zod'
import { DomainSchema } from 'src/shared/schemas'
import { z } from 'zod'

export class SearchDomainSchema extends createZodDto(
  z.object({
    domain: DomainSchema,
  }),
) {}
