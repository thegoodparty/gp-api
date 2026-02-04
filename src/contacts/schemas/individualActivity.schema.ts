import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { ConstituentActivityType } from '../contacts.types'

const individualActivityParamsSchema = z.object({
  id: z.string(),
})

const individualActivityQuerySchema = z.object({
  type: z
    .nativeEnum(ConstituentActivityType)
    .optional()
    .default(ConstituentActivityType.POLL_INTERACTIONS),
  take: z.coerce.number().int().optional(),
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
