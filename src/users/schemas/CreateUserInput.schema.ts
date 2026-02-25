import { CreateUserInputSchema as BaseCreateUserInputSchema } from '@goodparty_org/contracts'
import { WriteEmailSchema } from 'src/shared/schemas'
import { createZodDto } from 'nestjs-zod'

export { SIGN_UP_MODE } from '@goodparty_org/contracts'

export const CreateUserInputSchema = BaseCreateUserInputSchema.extend({
  email: WriteEmailSchema,
})

export class CreateUserInputDto extends createZodDto(CreateUserInputSchema) {}
