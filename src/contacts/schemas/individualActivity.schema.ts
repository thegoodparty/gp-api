import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const individualActivitySchema = z.object({
  id: z.coerce.number().optional(),
  take: z.string().optional(),
  after: z.string().optional(),
})

export class IndividualActivityDTO extends createZodDto(
  individualActivitySchema,
) {}

export type IndividualActivityInput = z.infer<typeof individualActivitySchema>
