import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateSurveyQuestionDto extends createZodDto(
  z
    .object({
      name: z.string().min(1),
      surveyId: z.number().int().positive(),
      order: z.number().int().positive().optional(),
      required: z.boolean().optional(),
      answerType: z.object({
        id: z.number(),
        name: z.string(),
      }),
      answers: z
        .array(
          z.object({
            name: z.string(),
          }),
        )
        .optional(),
    })
    .strict(),
) {}
