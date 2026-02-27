import { z } from 'zod'

export const UpdateSurveyQuestionInputSchema = z
  .object({
    name: z.string().min(1),
    surveyId: z.number().int().positive(),
    answers: z
      .array(
        z.object({
          name: z.string(),
        }),
      )
      .optional(),
  })
  .strict()

export type UpdateSurveyQuestionInput = z.infer<
  typeof UpdateSurveyQuestionInputSchema
>
