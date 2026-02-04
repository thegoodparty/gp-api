import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { ConstituentActivityType } from '../contacts.types'

const individualActivityParamsSchema = z.object({
  personId: z.string(),
  type: z
    .nativeEnum(ConstituentActivityType)
    .optional()
    .default(ConstituentActivityType.POLL_INTERACTIONS),
})

const individualActivityQuerySchema = z.object({
  take: z.coerce.number().optional(),
  after: z.string().optional(), // Last seen pollIndividualMessage ID
})

export class IndividualActivityParamsDTO extends createZodDto(
  individualActivityParamsSchema,
) {}

export class IndividualActivityQueryDTO extends createZodDto(
  individualActivityQuerySchema,
) {}

export type IndividualActivityInput = z.infer<
  typeof individualActivityParamsSchema
> &
  z.infer<typeof individualActivityQuerySchema> & { electedOfficeId: string }
