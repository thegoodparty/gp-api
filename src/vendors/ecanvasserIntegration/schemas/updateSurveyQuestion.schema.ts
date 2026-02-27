import { UpdateSurveyQuestionInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class UpdateSurveyQuestionSchema extends createZodDto(
  UpdateSurveyQuestionInputSchema,
) {}
