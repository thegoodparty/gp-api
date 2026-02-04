import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const constituentIssuesParamsSchema = z.object({
  id: z.string(),
})

const constituentIssuesQuerySchema = z.object({
  take: z.coerce.number().min(-20).max(20).optional().default(3),
  after: z.string().optional(),
})

export class ConstituentIssuesParamsDTO extends createZodDto(
  constituentIssuesParamsSchema,
) {}

export class ConstituentIssuesQueryDTO extends createZodDto(
  constituentIssuesQuerySchema,
) {}
