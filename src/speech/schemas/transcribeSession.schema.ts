import { createZodDto } from 'nestjs-zod'
import { TranscribeSessionRequestSchema } from '@goodparty_org/contracts'

export class TranscribeSessionRequestDto extends createZodDto(
  TranscribeSessionRequestSchema,
) {}
