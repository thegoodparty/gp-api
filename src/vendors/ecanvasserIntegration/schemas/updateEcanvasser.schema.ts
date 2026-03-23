import { UpdateEcanvasserInputSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class UpdateEcanvasserSchema extends createZodDto(
  UpdateEcanvasserInputSchema,
) {}
