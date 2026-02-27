import { CreateSurveyInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class CreateSurveySchema extends createZodDto(CreateSurveyInputSchema) {}
