import { z } from 'zod'
import { SurveyStatusSchema } from './enums'

export const CreateSurveyInputSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    requiresSignature: z.boolean().optional(),
    status: SurveyStatusSchema.optional(),
    teamId: z.number().int().positive().optional(),
  })
  .strict()

export type CreateSurveyInput = z.infer<typeof CreateSurveyInputSchema>
