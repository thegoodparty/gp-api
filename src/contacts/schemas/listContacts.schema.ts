import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const listContactsSchema = z.object({
  state: z
    .string()
    .transform((v) => v.toUpperCase())
    .refine((v) => v.length === 2, 'Invalid state code'),
  districtType: z.string(),
  districtName: z.string(),
  resultsPerPage: z.coerce.number().optional().default(50),
  page: z.coerce.number().optional().default(1),
})

export class ListContactsDTO extends createZodDto(listContactsSchema) {}
