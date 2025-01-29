import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { VoterFileType } from '../voterFile.types'

export class HelpMessageSchema extends createZodDto(
  z.object({
    type: z.nativeEnum(VoterFileType),
    message: z.string(),
  }),
) {}
