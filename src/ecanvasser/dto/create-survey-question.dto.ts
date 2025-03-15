import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class CreateSurveyQuestionDto extends createZodDto(
  z
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
    .strict(),
) {}
