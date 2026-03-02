import { UpdateSurveyInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class UpdateSurveySchema extends createZodDto(UpdateSurveyInputSchema) {}
