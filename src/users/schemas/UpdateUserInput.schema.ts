import { CreateUserInputSchema } from './CreateUserInput.schema'
import { UserMetaDataSchema } from '@goodparty_org/contracts'
import { createZodDto } from 'nestjs-zod'

export class UpdateUserInputSchema extends createZodDto(
  CreateUserInputSchema.omit({ password: true, roles: true }).partial(),
) {}

export class UpdateUserAdminInputSchema extends createZodDto(
  CreateUserInputSchema.omit({ password: true }).partial().extend({
    metaData: UserMetaDataSchema,
  }),
) {}
