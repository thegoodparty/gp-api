import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class UpdateSurveyQuestionDto extends createZodDto(
  z
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
    .strict(),
) {}
