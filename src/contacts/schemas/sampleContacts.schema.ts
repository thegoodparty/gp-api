import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const sampleContactsSchema = z.object({
  size: z.coerce.number().int().min(1).optional().default(500),
})

export class SampleContactsDTO extends createZodDto(sampleContactsSchema) {}
