import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { SurveyStatus } from './createSurvey.schema'
export class UpdateSurveySchema extends createZodDto(
  z
    .object({
      name: z.string().min(1),
      status: z.enum([SurveyStatus.Live, SurveyStatus.NotLive]),
    })
    .strict(),
) {}
