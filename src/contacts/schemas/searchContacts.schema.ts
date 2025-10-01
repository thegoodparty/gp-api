import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const searchContactsSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().min(2).max(30).optional(),
    page: z.coerce.number().optional().default(1),
    resultsPerPage: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(25),
  })
  .refine((v) => Boolean(v.name || v.phone), 'Provide name or phone to search')
export class SearchContactsDTO extends createZodDto(searchContactsSchema) {}
