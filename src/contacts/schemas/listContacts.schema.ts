import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const listContactsSchema = z.object({
  resultsPerPage: z.coerce.number().optional().default(50),
  page: z.coerce.number().optional().default(1),
  search: z.string().optional(),
  segment: z.string().optional(),
})

const downloadContactsSchema = z.object({
  segment: z.string().optional(),
})

export class ListContactsDTO extends createZodDto(listContactsSchema) {}
export class DownloadContactsDTO extends createZodDto(downloadContactsSchema) {}
