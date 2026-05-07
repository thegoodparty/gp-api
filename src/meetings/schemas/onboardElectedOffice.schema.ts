import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const OnboardElectedOfficeSchema = z.object({
  expectedBody: z.string().min(1).max(200).optional(),
})

export class OnboardElectedOfficeDto extends createZodDto(
  OnboardElectedOfficeSchema,
) {}
