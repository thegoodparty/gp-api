import { z } from 'zod'
import { SurveyStatusSchema } from './enums'

export const UpdateSurveyInputSchema = z
  .object({
    name: z.string().min(1),
    status: SurveyStatusSchema,
  })
  .strict()

export type UpdateSurveyInput = z.infer<typeof UpdateSurveyInputSchema>
