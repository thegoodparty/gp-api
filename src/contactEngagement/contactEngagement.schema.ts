import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const individualActivityParamsSchema = z.object({
  id: z.string(),
})

const individualActivityQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(20).optional().default(20),
  after: z.string().optional(), // Last seen pollIndividualMessage ID
})

export class IndividualActivityParamsDTO extends createZodDto(
  individualActivityParamsSchema,
) {}

export class IndividualActivityQueryDTO extends createZodDto(
  individualActivityQuerySchema,
) {}

export type IndividualActivityInput = {
  personId: string
  electedOfficeId: string
} & z.infer<typeof individualActivityQuerySchema>

const constituentIssuesParamsSchema = z.object({
  id: z.string(),
})

const constituentIssuesQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(20).optional().default(3),
  after: z.string().optional(),
})

export class ConstituentIssuesParamsDTO extends createZodDto(
  constituentIssuesParamsSchema,
) {}

export class ConstituentIssuesQueryDTO extends createZodDto(
  constituentIssuesQuerySchema,
) {}
