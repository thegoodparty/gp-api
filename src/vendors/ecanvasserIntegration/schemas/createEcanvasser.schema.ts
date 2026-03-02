import { CreateEcanvasserInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class CreateEcanvasserSchema extends createZodDto(
  CreateEcanvasserInputSchema,
) {}
