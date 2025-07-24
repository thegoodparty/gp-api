import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const FindByOfficeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  office: z.string().min(1, 'Office is required'),
  state: z.string().length(2, 'State must be a 2-letter code').toUpperCase(),
  municipality: z.string().optional(),
})

export class FindByOfficeDto extends createZodDto(FindByOfficeSchema) {} 