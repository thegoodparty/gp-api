import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const sampleContactsSchema = z.object({
  size: z.coerce.number().int().min(1).optional().default(500),
})

export class SampleContactsDTO extends createZodDto(sampleContactsSchema) {}

export type SampleContacts = z.infer<typeof sampleContactsSchema>
