import { CreateSurveyInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export { type SurveyStatus } from '@goodparty_org/contracts'

export class CreateSurveySchema extends createZodDto(CreateSurveyInputSchema) {}
