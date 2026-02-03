import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const individualActivityParamsSchema = z.object({
  id: z.string(),
})

const individualActivityQuerySchema = z.object({
  take: z.coerce.number().optional(),
  after: z.string().optional(),
})

export class IndividualActivityParamsDTO extends createZodDto(
  individualActivityParamsSchema,
) {}

export class IndividualActivityQueryDTO extends createZodDto(
  individualActivityQuerySchema,
) {}

export type IndividualActivityInput = z.infer<
  typeof individualActivityParamsSchema
>
