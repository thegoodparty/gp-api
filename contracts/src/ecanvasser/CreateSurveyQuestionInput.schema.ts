import { z } from 'zod'

export const CreateSurveyQuestionInputSchema = z
  .object({
    name: z.string().min(1),
    surveyId: z.number().int().positive(),
    order: z.number().int().positive().optional(),
    required: z.boolean().optional(),
    answerFormatName: z.string().optional(),
    answerFormatId: z.number().int().positive(),
    answers: z
      .array(
        z.object({
          name: z.string(),
        }),
      )
      .optional(),
  })
  .strict()

export type CreateSurveyQuestionInput = z.infer<
  typeof CreateSurveyQuestionInputSchema
>
