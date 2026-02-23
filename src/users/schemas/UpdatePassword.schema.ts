import { UpdatePasswordSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class UpdatePasswordSchemaDto extends createZodDto(UpdatePasswordSchema) {}
