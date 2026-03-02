import { CreateSurveyQuestionInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class CreateSurveyQuestionSchema extends createZodDto(
  CreateSurveyQuestionInputSchema,
) {}
