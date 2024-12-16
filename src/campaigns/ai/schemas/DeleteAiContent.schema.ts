import { PickType } from '@nestjs/swagger'
import { RenameAiContentSchema } from './RenameAiContent.schema'

export class DeleteAiContentSchema extends PickType(RenameAiContentSchema, [
  'key',
]) {}
